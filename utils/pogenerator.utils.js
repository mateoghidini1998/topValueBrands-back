const axios = require('axios');
const fs = require('fs');
const readline = require('readline/promises');
const inventory = require('../data/NewInventory.json');
const asyncHandler = require('../middlewares/async')
const path = require('path');
const dotenv = require('dotenv');
const { Product } = require('../models');

dotenv.config({ path: './.env' });

const createReport = asyncHandler(async (req, res, next) => {
  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports`;

  const requestBody = {
    "reportType": "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL",
    "marketplaceIds": [`${process.env.MARKETPLACE_US_ID}`],
    "custom": true
  };

  const response = await axios.post(url, requestBody, {
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': req.headers['x-amz-access-token']
    }
  });
  // console.log('Reporte Generado...')
  return response.data.reportId;
});

let reportId = ''
const pollReportStatus = async (reportId, accessToken) => {
  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports/${reportId}`;
  let reportStatus = '';
  while (reportStatus !== 'DONE') {
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken
      }
    });
    reportStatus = response.data.processingStatus;
    // console.log(reportStatus)
    // Wait for a short period before polling again to avoid hitting rate limits
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

  }
  return reportStatus;
};

const getReportById = asyncHandler(async (req, res, next) => {
  // Call createReport and get the reportId
  const reportId = await createReport(req, res, next);
  const accessToken = req.headers['x-amz-access-token'];

  try {
    // Poll the report status until it's DONE
    await pollReportStatus(reportId, accessToken);

    const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports/${reportId}`;
    console.log('URL: ', url);

    const reportResponse = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-access-token': accessToken
      }
    });
    console.log('Obtuvimos el reporte')
    return reportResponse.data
  } catch (error) {

    res.status(500).json({ message: 'Error fetching report' });
  }
});

const generateReport = asyncHandler(async (req, res, next) => {
  reportId = await getReportById(req, res, next);
  let documentId = reportId.reportDocumentId;
  const response = await axios.get(`${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': req.headers['x-amz-access-token']
    }
  });
  let documentUrl = response.data.url;
  console.log('Se genero el documento del reporte')
  return documentUrl;
});

const downloadCSVReport = asyncHandler(async (req, res, next) => {
  try {
    let documentUrl = await generateReport(req, res, next);

    const response = await axios.get(documentUrl, {
      responseType: 'arraybuffer'
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

    console.log('Se descargo el documento como CSV')
    return csvFilePath

  } catch (error) {
    // console.error(error);
    return res.status(500).send('Internal Server Error');
  }
});

exports.sendOrderCSVasJSON = asyncHandler(async (req, res, next) => {
  try {
    const csvFile = await downloadCSVReport(req, res, next);
    // For testing
    /* const csvFile =  './reports/report_1715617166789.csv' */

    const results = [];
    let keys = [];

    const rl = readline.createInterface({
      input: fs.createReadStream(csvFile, { encoding: 'utf8' }),
      crlfDelay: Infinity
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
    return results;
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Internal Server Error');
  }
});


