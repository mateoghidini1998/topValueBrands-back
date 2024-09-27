const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const zlib = require('zlib');
const moment = require('moment');
const asyncHandler = require('../middlewares/async');
const inventory = require('../data/Inventory.json');
const { Product } = require('../models');
const logger = require('../logger/logger');

const createReport = asyncHandler(async (req, reportType) => {
  logger.info('Executing createReport...');
  console.log('Executing createReport...');
  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports`;

  let requestBody = {
    reportType,
    marketplaceIds: [`${process.env.MARKETPLACE_US_ID}`],
  };

  /* if (reportType === 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL') {
    const dataEndTime = moment().utc().endOf('day').toISOString();
    const dataStartTime = moment()
      .utc()
      .subtract(30, 'days')
      .startOf('day')
      .toISOString();
    requestBody = {
      ...requestBody,
      dataStartTime,
      dataEndTime,
      custom: true,
    };
  } else if (reportType === 'GET_FBA_MYI_ALL_INVENTORY_DATA') {
    requestBody = {
      ...requestBody,
      custom: true,
    };
  } */

  const dataEndTime = moment().utc().endOf('day').toISOString();
  const dataStartTime = moment()
    .utc()
    .subtract(30, 'days')
    .startOf('day')
    .toISOString();
  requestBody = {
    ...requestBody,
    dataStartTime,
    dataEndTime,
    custom: true,
  };

  const response = await axios.post(url, requestBody, {
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': req.headers['x-amz-access-token'],
    },
  });
  console.log(response.data);
  return response.data.reportId;
});

const pollReportStatus = async (reportId, accessToken) => {
  logger.info('Executing pollReportStatus...');
  console.log('Executing pollReportStatus...');
  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports/${reportId}`;
  console.log('URL: ', url)
  let reportStatus = '';
  let reportDocument = '';

  while (reportStatus !== 'DONE') {
    if (reportStatus === 'FATAL' || reportStatus === 'CANCELLED') {
      console.log(reportStatus);
      logger.error('Error fetching report with status' + reportStatus);
      console.log('Error fetching report with status' + reportStatus);
      return new Error('Error fetching report');
    }

    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken,
      },
    });
    console.log(reportStatus);
    reportStatus = response.data.processingStatus;
    reportDocument = response.data.reportDocumentId;
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
  return reportDocument;
};

const getReportById = asyncHandler(async (req, reportType) => {
  logger.info('Executing getReportById...');
  console.log('Executing getReportById...');
  const reportId = await createReport(req, reportType);
  const accessToken = req.headers['x-amz-access-token'];

  try {
    // Poll the report status until it's DONE
    const reportResponse = await pollReportStatus(reportId, accessToken);
    console.log('REPORT RESPONSE: ', reportResponse);
    console.log('Obtuvimos el reporte');
    return reportResponse;
  } catch (error) {
    logger.error('Error fetching report:', error);
    console.error('Error fetching report:', error);
  }
});

const generateOrderReport = asyncHandler(async (req, res, next) => {
  logger.info('Executing generateOrderReport...');
  console.log('Executing generateOrderReport...');
  const reportData = await getReportById(
    req,
    'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL'
  );

  if (!reportData) {
    throw new Error('Report data is invalid or missing reportDocumentId');
  }

  const documentId = reportData;

  const response = await axios.get(
    `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': req.headers['x-amz-access-token'],
      },
    }
  );

  if (!response.data || !response.data.url) {
    throw new Error('Failed to retrieve document URL from response');
  }

  const documentUrl = response.data.url;
  const compressionAlgorithm = response.data.compressionAlgorithm;

  // Obtener el contenido del documento desde la URL
  const documentResponse = await axios.get(documentUrl, {
    responseType: 'arraybuffer',
  });

  // Descomprimir y decodificar los datos si es necesario
  let decodedData;
  if (compressionAlgorithm === 'GZIP') {
    decodedData = zlib.gunzipSync(Buffer.from(documentResponse.data));
  } else {
    decodedData = Buffer.from(documentResponse.data);
  }

  // Convertir los datos decodificados a string
  const dataString = decodedData.toString('utf-8');

  // Verificar que dataString no sea nulo ni indefinido antes de devolverlo
  if (!dataString) {
    throw new Error('Failed to decode report data');
  }

  const jsonData = parseReportToJSON(dataString);
  return jsonData;
});

const generateInventoryReport = asyncHandler(async (req, res, next) => {
  logger.info('Executing generateInventoryReport...');
  console.log('Executing generateInventoryReport...');
  const report = await getReportById(req, 'GET_FBA_MYI_ALL_INVENTORY_DATA');
  console.log('REPORT:', report);
  /* if (!report) {
    throw new Error('Invalid or missing report data');
  } */
  const documentId = report;
  console.log('Document ID : ', documentId);
  const response = await axios.get(
    `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': req.headers['x-amz-access-token'],
      },
    }
  );
  let documentUrl = response.data.url;
  console.log('Report document generated');
  return documentUrl;
});

const downloadCSVReport = asyncHandler(async (req, res, next) => {
  logger.info('Executing downloadCSVReport...');
  console.log('Executing downloadCSVReport...');
  try {
    let documentUrl = await generateInventoryReport(req, res, next);

    const response = await axios.get(documentUrl, {
      responseType: 'arraybuffer',
    });

    let responseData = response.data;

    if (responseData.compressionAlgorithm) {
      try {
        responseData = require('zlib').gunzipSync(responseData);
      } catch (error) {
        // console.error(error.message);
        return res.status(500).send('Error while decompressing data');
      }
    }

    const csvDirectory = path.resolve('./reports');
    if (!fs.existsSync(csvDirectory)) {
      fs.mkdirSync(csvDirectory);
    }

    // Generate unique filename for CSV file
    const timestamp = Date.now();
    const csvFilename = `report_${timestamp}.csv`;
    const csvFilePath = path.join(csvDirectory, csvFilename);

    // Write CSV data to file
    fs.writeFileSync(csvFilePath, responseData);

    console.log('Se descargo el documento como CSV');
    logger.info('Se descargo el documento como CSV');
    logger.info('CSV file path:', csvFilePath);
    return csvFilePath;
  } catch (error) {
    logger.error('Error downloading CSV report: ' + error.message);
    // console.error(error);
    return res.status(500).send('Internal Server Error');
  }
});

const parseReportToJSON = (dataString) => {
  logger.info('Executing parseReportToJSON...');
  console.log('Executing parseReportToJSON...');
  const results = [];
  const lines = dataString.split('\n');
  const keys = lines[0].split('\t');

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    if (values.length === keys.length) {
      const obj = {};
      keys.forEach((key, index) => {
        obj[key] = values[index];
      });
      results.push(obj);
    }

  }
  console.log('parseReportToJSON results: ' + results.length)
  logger.info('parseReportToJSON results: ' + results.length)
  return results;
};

const sendCSVasJSON = asyncHandler(async (req, res, next) => {
  logger.info('Executing sendCSVasJSON...');
  console.log('Executing sendCSVasJSON...');
  try {
    const csvFile = await downloadCSVReport(req, res, next);
    // For testing
    // const csvFile = './reports/report_1721053509338.csv'

    const results = [];
    let keys = [];

    const rl = readline.createInterface({
      input: fs.createReadStream(csvFile, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!keys.length) {
        // La primera línea contiene los nombres de las claves
        keys = line.split('\t');
      } else {
        // Las siguientes líneas contienen los valores
        const values = line.split('\t');
        const obj = {};
        keys.forEach((key, index) => {
          obj[key] = values[index];
        });
        results.push(obj);
      }
    }
    // res.json({ count: results.length, items: results });
    console.log(`Se envio el documento como JSON correctamente con ${results.length} registros`);
    logger.info(`Se envio el documento como JSON correctamente con ${results.length} registros`);
    return results;
  } catch (error) {
    // console.error(error.message);
    res.status(500).send('Internal Server Error');
  }
});

const importJSON = asyncHandler(async (req, res, next) => {
  logger.info('Executing importJSON...');
  console.log('Executing importJSON...');

  try {
    for (const item of inventory) {
      await Product.update(
        {
          supplier_item_number: item.MPN,
          supplier_id: item.Supplier,
          product_cost: item.Cost,
        },
        {
          where: {
            seller_sku: item.SKU,
          },
        }
      );
      // console.log(`Actualizado el producto con ASIN: ${item.SKU}`);
    }
    return res
      .status(200)
      .json({ message: 'Productos actualizados correctamente' });
  } catch (error) {
    // console.error('Error al actualizar los productos:', error);
  }
});

module.exports = {
  createReport,
  pollReportStatus,
  getReportById,
  generateOrderReport,
  sendCSVasJSON,
  parseReportToJSON,
  generateInventoryReport,
  importJSON,
  downloadCSVReport,
};
