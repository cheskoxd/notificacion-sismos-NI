const express = require('express');
const axios = require('axios');
const fs = require('fs');
const PImage = require('pureimage');
const path = require('path');
const app = express();

const cheerio = require('cheerio');
const https = require('https');

// Create an axios instance that ignores SSL certificate errors
const instance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Disable SSL verification
  })
});

function parseEarthquakeData(text) {
  try {
    // Split the text by whitespace, accounting for multiple spaces
    const parts = text.trim().split(/\s+/);
    
    // Extract components based on expected format
    const date = parts[0]; // e.g., 25/08/02
    const time = parts[1]; // e.g., 19:46:37
    const lat = parseFloat(parts[2]); // e.g., 14.020
    const lon = parseFloat(parts[3]); // e.g., -89.780
    const depth = parseFloat(parts[4]); // e.g., 5
    const magnitude = parseFloat(parts[5]); // e.g., 2.2
    // Location is everything after the 6th part (index 7 onwards, skipping 'C')
    const location = parts.slice(7).join(' '); // e.g., 13 Km al noreste de Ahuachapan, El Salvador

    // Combine date and time for a full timestamp
    const dateTime = `${date} ${time}`;

    // Return parsed object
    return {
      date: dateTime,
      lon,
      lat,
      depth,
      magnitude,
      location,
      all:text
    };
  } catch (error) {
    console.error('Error parsing text:', error.message);
    return null;
  }
}

async function fetchAndParse() {
  try {
    // Fetch the HTML from the endpoint using the custom axios instance
    const response = await instance.get('https://webserver2.ineter.gob.ni/geofisica/sis/events/sismos.php');
    
    // Load the HTML into Cheerio
    const $ = cheerio.load(response.data);
    
    // Get the text content of the first <a> tag
    const firstLinkText = $('a').first().text().trim();
    
    return parseEarthquakeData(firstLinkText);
  } catch (error) {
    console.error('Error fetching or parsing:', error.message);
  }
}

const { PassThrough } = require('stream');
const { buffer } = require('stream/consumers');

const GOOGLE_MAPS_API_KEY = 'AIzaSyCHbqQN5KxV3OT68I9bRiZvMl-sdeaJUMs'; // <-- Replace this


let lastSismo = ""
let lastImagePath = "";

app.use(express.json());
app.use(express.static('public'));


PImage.registerFont(path.join(__dirname, 'static/Figtree.ttf'), 'Figtree').loadSync();
PImage.registerFont(path.join(__dirname, 'static/Figtree-Bold.ttf'), 'Figtree-Bold').loadSync();
PImage.registerFont(path.join(__dirname, 'static/Figtree-Black.ttf'), 'Figtree-Black').loadSync();


const centralAmericaCountryCodes = {
  "Belize": "BZ",
  "Costa Rica": "CR",
  "El Salvador": "SV",
  "Guatemala": "GT",
  "Honduras": "HN",
  "Nicaragua": "NI",
  "Panama": "PA"
};


app.get('/webhook', async (req, res) => {
//   const { magnitude, location, lat, lon, depth } = req.body;

  const {magnitude, location, lat, lon, depth, all, date} = await fetchAndParse();

  if (lastImagePath) {
        fs.unlink(lastImagePath, (err) => {
            if (err) {
                console.error("Error deleting previous image:", err);
            } else {
                console.log("Successfully deleted old image:", lastImagePath);
            }
        });
    }


  if( lastSismo === all) {
    console.log("No new sismo detected, skipping image generation.");
    return res.status(200).send({ status: 'ok', message: 'No new sismo detected' });
    }

  try {
    const img = PImage.make(1200, 675);
    const ctx = img.getContext('2d');

    // Background
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, 1200, 675);

    // Load map from Google
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=9&format=png&scale=2&size=600x250&markers=color:red%7Clabel:E%7C${lat},${lon}&maptype=hybrid&key=${GOOGLE_MAPS_API_KEY}`;
    const mapBuffer = (await axios.get(mapUrl, { responseType: 'arraybuffer' })).data;

    const countryCode = location.split(',')[location.split(",").length-1].trim()
    console.log(`Country code extracted: ${countryCode}`);

    const flagBuffer = (await axios.get(`https://flagsapi.com/${centralAmericaCountryCodes[countryCode]}/flat/64.png`, { responseType: 'arraybuffer' })).data;
    
    const mapImg = await PImage.decodePNGFromStream(fs.createReadStream(
      await new Promise((resolve, reject) => {
        const tempPath = `tempMap.png`;
        fs.writeFile(tempPath, mapBuffer, (err) => err ? reject(err) : resolve(tempPath));
      })
    ));
    const flagImg = await PImage.decodePNGFromStream(fs.createReadStream(
      await new Promise((resolve, reject) => {
        const tempPath = `tempFlag.png`;
        fs.writeFile(tempPath, flagBuffer, (err) => err ? reject(err) : resolve(tempPath));
      })
    ));

    ctx.drawImage(mapImg, 0, 175);
    ctx.drawImage(flagImg, 30, 88);

    //draw a black swuasre 
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(809, 645, 391, 30);

    ctx.fillStyle = 'white';
    ctx.font = '21px Figtree-Bold';
    ctx.fillText('Hecho por Cheskodev', 904, 667);
    // Set font and color
    
    ctx.fillStyle = 'white';
    ctx.font = '50px Figtree-Black';
    ctx.fillText('Sismo en ' + countryCode, 30, 70);
    
    ctx.fillStyle = '#dddddd';
    ctx.font = '35px Figtree-Bold';
    const cleanedLocation = location.replace(/,\s*[^,]+$/, '');
    ctx.fillText(cleanedLocation, 110, 132);

    ctx.fillStyle = '#c4c4c4';
    ctx.font = '30px Figtree-Black';
    
    ctx.fillText('Profundidad', 795,54 );
    ctx.fillText('Magnitud', 1027,54 );

    ctx.fillStyle = 'white';
    ctx.font = '66pt Figtree-Black';

    
    
    ctx.fillText(`${depth}km`, depth >= 10 ? 800 : 815, 132);
    ctx.fillText(`${magnitude}`, 1040, 132);

    const outputPath = `sismo_${Date.now()}.png`;
    const outStream = fs.createWriteStream("public/"+ outputPath);
    await PImage.encodePNGToStream(img, outStream);
    outStream.end();
    lastSismo = all; 
    lastImagePath = outputPath;

    res.status(200).send({ status: 'ok', image: outputPath,magnitude, location, depth, date })
    
    // const pass = new PassThrough();
    // PImage.encodePNGToStream(img, pass);

    // const buf = await buffer(pass);
    // const base64 = buf.toString('base64');


    // res.status(200).send({ status: 'ok', image: `data:image/png;base64,${base64}` });
        
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to create image' });
  }
});

app.listen(3000, () => console.log('Webhook server running on http://localhost:3000'));
