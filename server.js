'use strict';


//Application Dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

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

//routes
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/yelp', getYelp);
app.get('/movies', getMov);

//========================LOOK FOR RESULTS IN DATABASE==============================================//

function lookup(options) {
  const SQL = 'SELECT * FROM ${options.tableName} WHERE location_id=$1;';
  const values = [options.location];

  client.query(SQL, values)
    .then(result => {
      if result.rowCount > 0) {
        options.cacheHit(result);
      } else{
        options.cahcheMiss();
      }
    })
    .catch(error => handleError(error));
}





//Handlers
function getLocation (request, response) {
  //check database for location info
  let lookupHandler = {
    cacheHit : (data) => {
      response.status(200).send(data.rows[0]);
    },
    cacheMiss : (query) => {
      return fetchLocation(query)
        .then(result => {
          response.send(result);
        });
    }
  };
  lookupLocation(request.query.data, lookupHandler);
}

function getWeather (request, response) {
  searchWeather(request.query.data)
    .then(weatherData => {
      response.send(weatherData);
    })
    .catch(err => {
      console.error(err);
    });
}

function getYelp (request, response){
  return searchYelps(request.query.data)
    .then(yelpData => {
      response.send(yelpData);}
    );
}

function getMov (request, response) {
  return searchMovs(request.query.data)
    .then(movData => {
      response.send(movData);}
    );
}

//Constructor Function
function Location(query, res){
  this.tableName = 'locations';
  this.search_query = query;
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
}

function Weather(forecast) {
  this.forecast = forecast.summary;
  this.time = new Date(forecast.time * 1000).toDateString();
}

function Bsns (bsns) {
  this.name = bsns.name;
  this.image_url = bsns.image_url;
  this.price = bsns.price;
  this.ratin5g = bsns.rating;
  this.url = bsns.url;
}

function Movie(movie) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = `http://image.tmdb.org/t/p/w200_and_h300_bestv2${movie.poster_path}`;
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
}

//SQL
Location.lookupLocation = (location) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [location.query];

  return client.query(SQL, values)
    .then(result => {
      if(result.rowCount > 0) {
        location.cacheHit(result);
      } else {
        location.cacheMiss();
      }
    })
    .catch(console.error);
}

//Search Functions
function fetchLocation(query){
  const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(URL)
    .then(result => {
      console.log('Location retreived from google');
      // then normalize it
      let location = new Location(result.body.results[0]);
      let SQL = 'INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES($1, $2, $3, $4) RETURNING id';
      // store it in our db
      return client.query(SQL, [query, location.formatted_query, location.latitude, location.longitude])
        .then((result) => {
          location.id = result.rows[0].id;
          return location;
        });
    });
}

function searchWeather(req, rep){
  const weatherHandler = {
    tableName: Weather.tableName,
    location: req.query.data.id,
    cacheHit: function (result) {
      rep.send(result.rows);
    },
    cacheMiss: function () {
      const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
      superagent.get(url)
        .then(result => {
          const forecast = result.body.daily.data.map(day => {
            const summary = new Weather(day);
            summary.save(req.query.data.id);
            return summary;
          });
          rep.send(forecast);
        })
        .catch(error => handleError(error, rep));
    }
  };
  Weather.lookup(weatherHandler);
}

function searchMovs(query) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${query}`;
  return superagent.get(url)
    .then(moviesData => {
      // console.log(query);
      return moviesData.body.results.map(movie => new Movie(movie));
    });
}

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
