'use strict';

//Application Dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');
let lat;
let long;

//Load env vars;
require('dotenv').config();

const PORT = process.env.PORT || 3000;

//postgres
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

//app
const app = express();
app.use(cors());
app.get('/location', getLocation);


function getLocation (request, response) {
  //check database for location info
  let lookupHandler = { 
  cacheHit : (data) => {
  response.status(200).send(data.rows[0]);
},

  cacheMiss : (query) => {
    return fetchLocation(query)
    .then(result => {
    response.send(result)
    })
  }
}
  lookupLocation(request.query.data, lookupHandler);
}

function lookupLocation(query, handler){
  const SQL = 'SELECT * FROM locations WHERE search_query=$1'
  const values = [query]
  return client.query(SQL, values)
    .then(data => { // then if we have it, send it back;
      if (data.rowCount) {
        handler.cacheHit(data);
      } else {
        handler.cacheMiss(query);
      }
    })
    .catch(err => {
      console.error(err)
    response.send(err)
    })
}

function fetchLocation(query){
  // otherwise, get it from google

    const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`

    return superagent.get(URL)
      .then(result => {
        console.log('Location retreived from google')
        // then normalize it

        let location = new Location(result.body.results[0]);
        let SQL = `INSERT INTO locations 
            (search_query, formatted_query, latitude, longitude)
            VALUES($1, $2, $3, $4)`;

        // store it in our db
        return client.query(SQL, [query, location.formatted_query, location.latitude, location.longitude])
          .then(() => {
            return location;
          })
      })
}




// Get weather data
// app.get('/weather', (request, response) => {
//   searchWeather(request.query.data /*|| 'Lynnwood, WA'*/)
//     .then(weatherData => {
//       response.send(weatherData);
//     });
//   // console.log(weatherGet);
// });
//movies-----------------------------
// app.get('/movies', getMov);
// //mov func
// function getMov (request, response) {
//   return searchMovs(request.query.data)
//     .then(movData => {
//       response.send(movData);}
//     );
// }

function searchMovs(query) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${query}`;
  return superagent.get(url)
    .then(moviesData => {
      // console.log(query);
      return moviesData.body.results.map(movie => new Movie(movie));
    });
}
function Movie(movie) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  if (movie.poster_path) {
    this.image_url = `http://image.tmdb.org/t/p/w200_and_h300_bestv2${movie.poster_path}`;
  } else {
    this.image_url = null;
  }
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
}
//yelp-----------------------------------------------------------------------------------------------
// app.get('/yelp', getYelp);

// function getYelp (request, response){
//   return searchYelps(request.query.data)
//     .then(yelpData => {
//       response.send(yelpData);}
//     );
// }
function searchYelps(query) {
  const url = `https://api.yelp.com/v3/businesses/search?term=delis&latitude=${query.latitude}&longitude=${query.longitude}`;
  return superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(yelpData => {
      // console.log(yelpData.body.businesses);
      return yelpData.body.businesses.map(bsns => new Bsns(bsns));
    })
    .catch(err => console.error(err));
}
function Bsns (bsns){
  this.name = bsns.name;
  this.image_url = bsns.image_url;
  this.price = bsns.price;
  this.ratin5g = bsns.rating;
  this.url = bsns.url;
}

// from class
function searchToLatLong(query){
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(url)
    .then(geoData => {
      const location = new Location(geoData.body.results[0]);
      // console.log(location);
      return location;
    })
    .catch(err => console.error(err));

}

//yelp API you will have to use a .set inside, in the query function....

function searchWeather(query){
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${lat},${long}`;
  // body.results.geometry.location. lat || lng
  // console.log(url);
  // how to pull lat/long from google API, then format so we can input it into this URL
  return superagent.get(url)
    .then(weatherData => {
      let wArr = weatherData.body.daily.data.map(
        forecast => {
          let data = {};
          data.forecast = forecast.summary;
          data.time = new Date(forecast.time * 1000).toDateString();
          return data;
        }
      );
      return wArr;
    })
    .catch(err => console.error(err));
}

function Location(location, query){
  // this.query = query;
  this.formatted_query = location.formatted_address;
  this.latitude = location.geometry.location.lat;
  this.longitude = location.geometry.location.lng;
  lat = location.geometry.location.lat;
  long = location.geometry.location.lng;
}

// Error messages
app.get('/*', function(request, response) {
  response.status(404).send('halp, you are in the wrong place');
});

function errorMessage(response){
  response.status(500).send('something went wrong. plzfix.');
} //created a function to handle the 500 errors but not sure what to do with it

app.listen(PORT, () => {
  console.log(`app is up on port : ${PORT}`);
});
