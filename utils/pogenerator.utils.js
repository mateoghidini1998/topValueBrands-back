const axios = require('axios');
const fs = require('fs');
const asyncHandler = require('../middlewares/async')
const path = require('path');
const dotenv = require('dotenv');
const zlib = require('zlib');


dotenv.config({ path: './.env' });

const createReport = asyncHandler(async (req, res, next) => {
  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports`;

  const requestBody = {
    "reportType": "GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL",
    "marketplaceIds": [`${process.env.MARKETPLACE_US_ID}`],
    "dataStartTime": "2024-04-20T00:00:00Z",
    "dataEndTime": "2024-05-20T23:59:59Z",
    "custom": true
  };

  const response = await axios.post(url, requestBody, {
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': req.headers['x-amz-access-token']
    }
  });
  console.log('Reporte Generado...')
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
    console.log(reportStatus)
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
    return reportResponse.data;
  } catch (error) {

    res.status(500).json({ message: 'Error fetching report' });
  }
});

exports.generateReport = asyncHandler(async (req, res, next) => {
  const reportData = await getReportById(req, res, next);

  if (!reportData || !reportData.reportDocumentId) {
    throw new Error('Report data is invalid or missing reportDocumentId');
  }

  const documentId = reportData.reportDocumentId;

  const response = await axios.get(`${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': req.headers['x-amz-access-token']
    }
  });

  if (!response.data || !response.data.url) {
    throw new Error('Failed to retrieve document URL from response');
  }

  const documentUrl = response.data.url;
  const compressionAlgorithm = response.data.compressionAlgorithm;

  // Obtener el contenido del documento desde la URL
  const documentResponse = await axios.get(documentUrl, { responseType: 'arraybuffer' });

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

  return res.json(jsonData);
});



const parseReportToJSON = (dataString) => {
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

  return results;
};