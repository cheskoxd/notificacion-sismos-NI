const axios = require('axios');
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
    const latitude = parseFloat(parts[2]); // e.g., 14.020
    const longitude = parseFloat(parts[3]); // e.g., -89.780
    const depth = parseFloat(parts[4]); // e.g., 5
    const magnitude = parseFloat(parts[5]); // e.g., 2.2
    // Location is everything after the 6th part (index 7 onwards, skipping 'C')
    const location = parts.slice(7).join(' '); // e.g., 13 Km al noreste de Ahuachapan, El Salvador

    // Combine date and time for a full timestamp
    const dateTime = `${date} ${time}`;

    // Return parsed object
    return {
      date: dateTime,
      longitude,
      latitude,
      depth,
      magnitude,
      location
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
    
    console.log(parseEarthquakeData(firstLinkText));
  } catch (error) {
    console.error('Error fetching or parsing:', error.message);
  }
}

// Run the function
fetchAndParse();