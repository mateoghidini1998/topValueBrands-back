const { fetchNewTokenForFees } = require("../middlewares/lwa_token");
const productService = require("../services/products.service");
const logger = require("../logger/logger");

const API_URL_BASE = "https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items";
const MARKETPLACE_ID = "ATVPDKIKX0DER";

/**
 * Petición individual a SP-API para obtener los atributos del producto.
 */
const fetchProductAttributes = async (asin, token) => {
  const url = `${API_URL_BASE}/${asin}?marketplaceIds=${MARKETPLACE_ID}&includedData=attributes`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-amz-access-token": token, // Amazon SP-API lo requiere
    },
  });

  if (response.status === 401) {
    // throw new Error("Token expirado o inválido.");
    logger.error("Token expirado o inválido.");
  }

  if (response.status === 429) {
    // throw new Error("Rate limit excedido.");
    logger.error("Rate limit excedido.");
  }

  if (!response.ok) {
    // throw new Error(`Error HTTP ${response.status}: ${await response.text()}`);
    logger.error(`Error HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json();
};

/**
 * Loop principal con control de rate limit (2 req/seg).
 */
const loopPeticiones = async () => {

  const asins = await (await productService.findAllProducts({ page: 1, limit: 1000 })).data.map((p) => {
    return {
      asin: p.ASIN,
      id: p.id
    }
  });

  let token = await fetchNewTokenForFees();

  for (let i = 0; i < asins.length; i++) {
    const asin = asins[i].asin;
    const productId = asins[i].id;

    try {
      const data = await fetchProductAttributes(asin, token);
      // console.log(`ASIN ${asin} obtenido correctamente:`, data);
      if (data.attributes.hazmat) {
        console.log("ASIN", asin, "tiene hazmat.");
        productService.updateProductDgType(productId, data.attributes.hazmat[0].value);
      } else {
        console.log("ASIN", asin, "no tiene hazmat.");
        // save on database 
        productService.updateProductDgType(productId, 'STANDARD');
      }

    } catch (error) {
      console.error(`Error al obtener ASIN ${asin}:`, error.message);

      // Si el token expira, intentamos renovarlo y reintentamos este ASIN
      if (error.message.includes("Token expirado")) {
        try {
          token = await fetchNewTokenForFees();
          console.log("Token renovado. Reintentando petición...");
          const data = await fetchProductAttributes(asin, token);
          console.log(`ASIN ${asin} reintentado correctamente:`, data);
        } catch (retryError) {
          console.error(`Error al reintentar ASIN ${asin}:`, retryError.message);
        }
      }

      // Podrías agregar reintentos también para status 429 si querés
    }

    // Esperar 500ms entre cada petición
    if (i < asins.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log("✔️ Todas las peticiones fueron procesadas.");
};

module.exports = loopPeticiones;