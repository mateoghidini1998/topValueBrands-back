const axios = require("axios");

const getProductDetailsByASIN = async (asin, accessToken) => {
  const url = `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items/${asin}?marketplaceIds=ATVPDKIKX0DER&includedData=images,summaries`;

  try {
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": accessToken,
      },
    });

    const productName = response.data.summaries?.[0]?.itemName || "Product name not found";

    const imagesData = response.data.images;
    let imageUrl = null;

    if (imagesData && imagesData.length > 0) {
      const imageLinks = imagesData[0]?.images || [];
      imageUrl =
        imageLinks.find((img) => img.width === 75 || img.height === 75)?.link ||
        imageLinks[0]?.link ||
        null;
    }

    return { productName, imageUrl };
  } catch (error) {
    console.error({
      msg: error.message,
      response: error.response?.data || "No response body",
      status: error.response?.status || "No status code",
    });

    return { productName: "Product name not found", imageUrl: null };
  }
};

module.exports = { getProductDetailsByASIN };
