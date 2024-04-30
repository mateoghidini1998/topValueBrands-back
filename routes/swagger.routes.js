const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUI = require('swagger-ui-express');

// Swagger options metadata about our API
const options = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Top Values Brand API',
      version: '1.0.0',
      description: 'Top Values Brand API',
    },
  },
  apis: ['./routes/*.js'],
}

const swaggerSpec = swaggerJSDoc(options);


// Function to setup the swagger UI
const swaggerDoc = (app, port) => {
  app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerSpec));
  app.get('/api-docs', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    // res.redirect('/api-docs/index.html')
    res.send(swaggerSpec)
  })
  console.log(`Swagger docs available at http://localhost:${port}/api-docs`);
}

// module.exports = swaggerUI.serve, swaggerUI.setup(swaggerSpec)
module.exports = {
  swaggerDoc
}