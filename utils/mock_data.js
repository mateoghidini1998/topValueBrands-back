// mockUtils.js

// Función para generar número entero aleatorio entre un rango
const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomFloat = (min, max, decimals = 2) => {
  const factor = Math.pow(10, decimals);
  return Math.floor((Math.random() * (max - min) + min) * factor) / factor;
};

const generateMockTrackedDataForProducts = (products) => {
  return products.map(product => ({
    product_id: product.id,
    currentSalesRank: getRandomInt(1, 300000),
    avg30: getRandomInt(1, 300000),
    avg90: getRandomInt(1, 300000),
    lowestFbaPrice: getRandomFloat(5, 100),
  }));
};

// Función que devuelve un objeto con los datos simulados para un producto
const generateMockProductTrackedData = () => {
  return {
    currentSalesRank: getRandomInt(1, 300000),
    avg30: getRandomInt(1, 300000),
    avg90: getRandomInt(1, 300000),
    lowestFbaPrice: getRandomFloat(5, 100), // Precio entre 5 y 100 dólares por ejemplo
  };
};

// Función para generar un array con N objetos simulados
const generateMockDataArray = (count) => {
  return Array.from({ length: count }, () => generateMockProductTrackedData());
};

// Exportar para usarlo donde lo necesites
module.exports = {
  generateMockProductTrackedData,
  generateMockDataArray,
  generateMockTrackedDataForProducts
};
