const axios = require("axios");
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const zlib = require("zlib");
const asyncHandler = require("../middlewares/async");
const inventory = require("../data/Inventory.json");
const { Product, SupressedListing, AmazonProductDetail } = require("../models");
const { sequelize } = require("../models");
const logger = require("../logger/logger");

const createReport = asyncHandler(async (req) => {
  logger.info("Executing createReport...");
  console.log("Executing createReport...");

  console.log("Body: ", req.body);

  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports`;
  try {
    const response = await axios.post(url, req.body, {
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": req.headers["x-amz-access-token"],
      },
    });

    if (!response.data || !response.data.reportId) {
      throw new Error("Error creating report");
    }

    logger.info("Report created successfully");
    console.log("Report ID:", response.data.reportId);
    return response.data.reportId;
  } catch (error) {
    logger.error(`Error creating report: ${error.message}`);
    console.error("Error creating report:", error);
    throw error;
  }
});

const pollReportStatus = async (reportId, accessToken) => {
  logger.info("Executing pollReportStatus...");
  console.log("Executing pollReportStatus...");
  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports/${reportId}`;
  console.log("URL: ", url);
  let reportStatus = "";
  let reportDocument = "";

  while (reportStatus !== "DONE") {
    if (reportStatus === "FATAL" || reportStatus === "CANCELLED") {
      console.log(reportStatus);
      logger.error("Error fetching report with status" + reportStatus);
      console.log("Error fetching report with status" + reportStatus);
      return new Error("Error fetching report");
    }

    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": accessToken,
      },
    });
    console.log(reportStatus);
    reportStatus = response.data.processingStatus;
    reportDocument = response.data.reportDocumentId;
    await new Promise((resolve) => setTimeout(resolve, 20000)); // Poll every 20 seconds
  }
  return reportDocument;
};

const getReportById = asyncHandler(async (req, reportType) => {
  logger.info("Executing getReportById...");
  console.log("Executing getReportById...");
  console.log("Report Type: ", reportType);
  const reportId = await createReport(req);
  const accessToken = req.headers["x-amz-access-token"];

  try {
    // Poll the report status until it's DONE
    const reportResponse = await pollReportStatus(reportId, accessToken);
    console.log("REPORT RESPONSE: ", reportResponse);
    console.log("Obtuvimos el reporte");
    return reportResponse;
  } catch (error) {
    logger.error("Error fetching report:", error);
    console.error("Error fetching report:", error);
  }
});

const generateOrderReport = asyncHandler(async (req, res, next) => {
  logger.info("Executing generateOrderReport...");
  console.log("Executing generateOrderReport...");
  const reportData = await getReportById(
    req,
    "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL"
  );

  if (!reportData) {
    logger.error("Error getting report by id");
    throw new Error("Report data is invalid or missing reportDocumentId");
  }

  const documentId = reportData;

  const response = await axios.get(
    `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`,
    {
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": req.headers["x-amz-access-token"],
      },
    }
  );

  if (!response.data || !response.data.url) {
    logger.error(`Error getting the report with documentId: ${documentId}`);
    throw new Error("Failed to retrieve document URL from response");
  }

  const documentUrl = response.data.url;
  const compressionAlgorithm = response.data.compressionAlgorithm;

  // Obtener el contenido del documento desde la URL
  const documentResponse = await axios.get(documentUrl, {
    responseType: "arraybuffer",
  });

  // Descomprimir y decodificar los datos si es necesario
  let decodedData;
  if (compressionAlgorithm === "GZIP") {
    decodedData = zlib.gunzipSync(Buffer.from(documentResponse.data));
  } else {
    decodedData = Buffer.from(documentResponse.data);
  }

  // Convertir los datos decodificados a string
  const dataString = decodedData.toString("utf-8");

  // Verificar que dataString no sea nulo ni indefinido antes de devolverlo
  if (!dataString) {
    throw new Error("Failed to decode report data");
  }

  const jsonData = parseReportToJSON(dataString);
  return jsonData;
});

const generateOrderReportV2 = async (req, res, next) => {
  try {
    const response = await axios.get(
      `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/amzn1.spdoc.1.4.na.144f9538-3513-4d09-955f-b2179e36bab4.T3UDVRD6SUG0GL.2409`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-amz-access-token": req.headers["x-amz-access-token"],
        },
      }
    );

    if (!response.data || !response.data.url) {
      logger.error(`Error getting the report with documentId: ${documentId}`);
      throw new Error("Failed to retrieve document URL from response");
    }

    const documentUrl = response.data.url;
    const compressionAlgorithm = response.data.compressionAlgorithm;

    // Obtener el contenido del documento desde la URL
    const documentResponse = await axios.get(documentUrl, {
      responseType: "arraybuffer",
    });

    // Descomprimir y decodificar los datos si es necesario
    let decodedData;
    if (compressionAlgorithm === "GZIP") {
      decodedData = zlib.gunzipSync(Buffer.from(documentResponse.data));
    } else {
      decodedData = Buffer.from(documentResponse.data);
    }

    // Convertir los datos decodificados a string
    const dataString = decodedData.toString("utf-8");

    // Verificar que dataString no sea nulo ni indefinido antes de devolverlo
    if (!dataString) {
      throw new Error("Failed to decode report data");
    }

    const jsonData = parseReportToJSON(dataString);
    return jsonData;
  } catch (error) {
    logger.error('Error in generateOrderReportV2:', error);
    throw error;
  }
};

const generateSupressedListingItems = asyncHandler(async (req, res, next) => {
  logger.info("Executing generateOrderReport...");
  console.log("Executing generateOrderReport...");
  const reportData = await getReportById(
    req,
    "GET_MERCHANTS_LISTINGS_FYP_REPORT"
  );

  if (!reportData) {
    logger.error("Error getting report by id");
    throw new Error("Report data is invalid or missing reportDocumentId");
  }

  const documentId = reportData;

  const response = await axios.get(
    `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`,
    {
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": req.headers["x-amz-access-token"],
      },
    }
  );

  if (!response.data || !response.data.url) {
    logger.error(`Error getting the report with documentId: ${documentId}`);
    throw new Error("Failed to retrieve document URL from response");
  }

  const documentUrl = response.data.url;
  const compressionAlgorithm = response.data.compressionAlgorithm;

  // Obtener el contenido del documento desde la URL
  const documentResponse = await axios.get(documentUrl, {
    responseType: "arraybuffer",
  });

  // Descomprimir y decodificar los datos si es necesario
  let decodedData;
  if (compressionAlgorithm === "GZIP") {
    decodedData = zlib.gunzipSync(Buffer.from(documentResponse.data));
  } else {
    decodedData = Buffer.from(documentResponse.data);
  }

  // Convertir los datos decodificados a string
  const dataString = decodedData.toString("utf-8");

  // Verificar que dataString no sea nulo ni indefinido antes de devolverlo
  if (!dataString) {
    throw new Error("Failed to decode report data");
  }

  const jsonData = parseReportToJSON(dataString);
  return jsonData;
});

const generateAmazonListingsData = asyncHandler(async (req, res, next) => {
  const reportData = await getReportById(req, "GET_MERCHANT_LISTINGS_ALL_DATA");

  if (!reportData) {
    logger.error("Error getting report by id");
    throw new Error("Report data is invalid or missing reportDocumentId");
  }

  const documentId = reportData;

  const response = await axios.get(
    `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`,
    {
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": req.headers["x-amz-access-token"],
      },
    }
  );

  if (!response.data || !response.data.url) {
    logger.error(`Error getting the report with documentId: ${documentId}`);
    throw new Error("Failed to retrieve document URL from response");
  }

  const documentUrl = response.data.url;
  const compressionAlgorithm = response.data.compressionAlgorithm;

  // Obtener el contenido del documento desde la URL
  const documentResponse = await axios.get(documentUrl, {
    responseType: "arraybuffer",
  });

  // Descomprimir y decodificar los datos si es necesario
  let decodedData;
  if (compressionAlgorithm === "GZIP") {
    decodedData = zlib.gunzipSync(Buffer.from(documentResponse.data));
  } else {
    decodedData = Buffer.from(documentResponse.data);
  }

  // Convertir los datos decodificados a string
  const dataString = decodedData.toString("utf-8");

  // Verificar que dataString no sea nulo ni indefinido antes de devolverlo
  if (!dataString) {
    throw new Error("Failed to decode report data");
  }

  const jsonData = parseReportToJSON(dataString);
  return jsonData;
});

const generateBreakdownForReservedInventory = asyncHandler(
  async (req, res, next) => {
    // const reportData = await getReportById(
    //   req,
    //   'GET_RESTOCK_INVENTORY_RECOMMENDATIONS_REPORT'
    // );

    // if (!reportData) {
    //   logger.error("Error getting report by id");
    //   throw new Error('Report data is invalid or missing reportDocumentId');
    // }

    // const documentId = reportData;
    const documentId =
      "amzn1.spdoc.1.4.na.e3b22cc4-981e-479e-aec5-1fe7956d44db.T3UASII812MA19.94300";

    const response = await axios.get(
      `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "x-amz-access-token": req.headers["x-amz-access-token"],
        },
      }
    );

    if (!response.data || !response.data.url) {
      logger.error(`Error getting the report with documentId: ${documentId}`);
      throw new Error("Failed to retrieve document URL from response");
    }

    const documentUrl = response.data.url;
    const compressionAlgorithm = response.data.compressionAlgorithm;

    // Obtener el contenido del documento desde la URL
    const documentResponse = await axios.get(documentUrl, {
      responseType: "arraybuffer",
    });

    // Descomprimir y decodificar los datos si es necesario
    let decodedData;
    if (compressionAlgorithm === "GZIP") {
      decodedData = zlib.gunzipSync(Buffer.from(documentResponse.data));
    } else {
      decodedData = Buffer.from(documentResponse.data);
    }

    // Convertir los datos decodificados a string
    const dataString = decodedData.toString("utf-8");

    // Verificar que dataString no sea nulo ni indefinido antes de devolverlo
    if (!dataString) {
      throw new Error("Failed to decode report data");
    }

    const jsonData = parseReportToJSON(dataString);
    return jsonData;
  }
);

const generateInventoryReport = asyncHandler(async (req, res, next) => {
  logger.info("Executing generateInventoryReport...");
  console.log("Executing generateInventoryReport...");
  const report = await getReportById(req, "GET_FBA_MYI_ALL_INVENTORY_DATA");

  const documentId = report;
  console.log("Document ID : ", documentId);
  const response = await axios.get(
    `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`,
    {
      headers: {
        "Content-Type": "application/json",
        "x-amz-access-token": req.headers["x-amz-access-token"],
      },
    }
  );
  let documentUrl = response.data.url;
  console.log("Report document generated");
  return documentUrl;
});

const downloadCSVReport = asyncHandler(async (req, res, next) => {
  logger.info("Executing downloadCSVReport...");
  console.log("Executing downloadCSVReport...");
  try {
    let documentUrl = await generateInventoryReport(req, res, next);

    const response = await axios.get(documentUrl, {
      responseType: "arraybuffer",
    });

    let responseData = response.data;

    if (responseData.compressionAlgorithm) {
      try {
        responseData = require("zlib").gunzipSync(responseData);
      } catch (error) {
        // console.error(error.message);
        return res.status(500).send("Error while decompressing data");
      }
    }

    const csvDirectory = path.resolve("./reports");
    if (!fs.existsSync(csvDirectory)) {
      fs.mkdirSync(csvDirectory);
    }

    // Generate unique filename for CSV file
    const timestamp = Date.now();
    const csvFilename = `report_${timestamp}.csv`;
    const csvFilePath = path.join(csvDirectory, csvFilename);

    // Write CSV data to file
    fs.writeFileSync(csvFilePath, responseData);

    console.log("Se descargo el documento como CSV");
    logger.info("Se descargo el documento como CSV");
    logger.info("CSV file path:", csvFilePath);
    return csvFilePath;
  } catch (error) {
    logger.error("Error downloading CSV report: " + error.message);
    // console.error(error);
    return res.status(500).send("Internal Server Error");
  }
});

const parseReportToJSON = (dataString) => {
  logger.info("Executing parseReportToJSON...");
  console.log("Executing parseReportToJSON...");
  const results = [];
  const lines = dataString.split("\n");
  const keys = lines[0].split("\t");

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split("\t");
    if (values.length === keys.length) {
      const obj = {};
      keys.forEach((key, index) => {
        obj[key] = values[index];
      });
      results.push(obj);
    }
  }
  console.log("parseReportToJSON results: " + results.length);
  logger.info("parseReportToJSON results: " + results.length);
  return results;
};

const sendCSVasJSON = asyncHandler(async (req, res, next) => {
  logger.info("Executing sendCSVasJSON...");
  console.log("Executing sendCSVasJSON...");
  try {
    const csvFile = await downloadCSVReport(req, res, next);
    // For testing
    // const csvFile = './reports/report_1739563413374.csv'

    const results = [];
    let keys = [];

    const rl = readline.createInterface({
      input: fs.createReadStream(csvFile, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!keys.length) {
        // La primera línea contiene los nombres de las claves
        keys = line.split("\t");
      } else {
        // Las siguientes líneas contienen los valores
        const values = line.split("\t");
        const obj = {};
        keys.forEach((key, index) => {
          obj[key] = values[index];
        });
        results.push(obj);
      }
    }
    // res.json({ count: results.length, items: results });
    console.log(
      `Se envio el documento como JSON correctamente con ${results.length} registros`
    );
    logger.info(
      `Se envio el documento como JSON correctamente con ${results.length} registros`
    );
    return results;
  } catch (error) {
    // console.error(error.message);
    res.status(500).send("Internal Server Error");
  }
});


const updateSupressedListings = asyncHandler(
  async (reqSupressedListings, res, next) => {
    logger.info("Executing updateSupressedListings...");

    const supressedData = await generateSupressedListingItems(
      reqSupressedListings,
      res,
      next
    );

    if (!supressedData) {
      logger.error("Generating order report failed");
      throw new Error("Failed to retrieve supressed listings");
    }

    try {
      // 1. Borrar todos los registros existentes
      await SupressedListing.destroy({
        where: {},
        truncate: true,
      });

      // 2. Insertar los nuevos datos
      await SupressedListing.bulkCreate(
        supressedData.map((item) => ({
          ASIN: item.ASIN,
          reason: item["Reason"],
          seller_sku: item.SKU,
          product_name: item["Product name"],
          condition: item.Condition,
          status_change_date: item["Status Change Date"],
          issue_description: item["Issue Description"],
        }))
      );

      logger.info("Supressed listings updated successfully");

      return res.status(200).json({
        msg: "Supressed listings updated successfully",
        success: true,
        totalItems: supressedData.length,
      });
    } catch (error) {
      logger.error(`Error in updateSupressedListings: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "Failed to update supressed listings information",
        error: error.message,
      });
    }
  }
);

const updateProductsListingStatus = asyncHandler(
  async (reqListingsData, res, next) => {
    logger.info("Executing updateSupressedListings...");

    const listingsData = await generateAmazonListingsData(
      reqListingsData,
      res,
      next
    );

    if (!listingsData) {
      logger.error("Generating order report failed");
    }

    try {
      //Update every listing
      for (const listing of listingsData) {
        await AmazonProductDetail.update(
          { isActiveListing: listing["status"] === "Active" },
          { where: { ASIN: listing["asin1"] } }
        );
      }

      return res.status(200).json({
        msg: "Listings status updated successfully",
        success: true,
        totalItems: listingsData.length,
      });
    } catch (error) {
      logger.error(`Error in updateListings: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "Failed to update Listings data information",
        error: error.message,
      });
    }
  }
);

const updateBreakdownForReservedInventory = asyncHandler(
  async (reqBreakdown, res, next) => {
    logger.info("Executing updateBreakdownForReservedInventory...");

    const breakdown = await generateBreakdownForReservedInventory(
      reqBreakdown,
      res,
      next
    );

    if (!breakdown) {
      logger.error("Generating order report failed");
    }

    try {
      //Update every listing
      for (const item of breakdown) {
        console.log(`Updating ASIN: ${item["ASIN"]}`);
        await AmazonProductDetail.update(
          {
            fc_transfer: item["FC transfer"],
            fc_processing: item["FC Processing"],
            customer_order: item["Customer Order"],
          },
          { where: { ASIN: item["ASIN"] } }
        );
      }

      return res.status(200).json({
        msg: "Breakdown updated successfully",
        success: true,
        totalItems: breakdown.length,
      });
    } catch (error) {
      logger.error(`Error in update breakdown: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "Failed to update breakdown data",
        error: error.message,
      });
    }
  }
);

module.exports = {
  createReport,
  pollReportStatus,
  getReportById,
  generateOrderReport,
  sendCSVasJSON,
  parseReportToJSON,
  generateInventoryReport,
  downloadCSVReport,
  updateSupressedListings,
  updateProductsListingStatus,
  updateBreakdownForReservedInventory,
  generateOrderReportV2,
};
