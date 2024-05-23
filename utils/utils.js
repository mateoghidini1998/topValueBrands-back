const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const zlib = require('zlib');
const moment = require('moment');
const asyncHandler = require('../middlewares/async');

const createReport = asyncHandler(async (req, reportType) => {
  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports`;

  let requestBody = {
    reportType,
    "marketplaceIds": [`${process.env.MARKETPLACE_US_ID}`]
  };

  if (reportType === 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL') {
    const dataEndTime = moment().utc().endOf('day').toISOString();
    const dataStartTime = moment().utc().subtract(30, 'days').startOf('day').toISOString();
    requestBody = {
      ...requestBody,
      dataStartTime,
      dataEndTime,
      custom: true
    };
  } else if (reportType === 'GET_FBA_MYI_ALL_INVENTORY_DATA') {
    requestBody = {
      ...requestBody,
      custom: true
    };
  }

  const response = await axios.post(url, requestBody, {
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': req.headers['x-amz-access-token']
    }
  });
  console.log(response.data);
  return response.data.reportId;
});

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
    console.log(reportStatus)
    reportStatus = response.data.processingStatus;
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds
  }
  return reportStatus;
};

const getReportData = asyncHandler(async (req, reportId) => {
  const accessToken = req.headers['x-amz-access-token'];

  await pollReportStatus(reportId, accessToken);

  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports/${reportId}`;
  const reportResponse = await axios.get(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': accessToken
    }
  });

  return reportResponse.data;
});

const generateDocumentUrl = asyncHandler(async (req, reportId) => {
  const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${reportId.reportDocumentId}`;
  const response = await axios.get(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': req.headers['x-amz-access-token']
    }
  });
  return response.data.url;
});

const downloadCSVReport = asyncHandler(async (documentUrl) => {
  const response = await axios.get(documentUrl, { responseType: 'arraybuffer' });
  let responseData = response.data;

  if (responseData.compressionAlgorithm) {
    try {
      responseData = require('zlib').gunzipSync(responseData);
    } catch (error) {
      throw new Error('Error while decompressing data');
    }
  }

  const csvDirectory = path.resolve('./reports');
  if (!fs.existsSync(csvDirectory)) {
    fs.mkdirSync(csvDirectory);
  }

  const timestamp = Date.now();
  const csvFilename = `report_${timestamp}.csv`;
  const csvFilePath = path.join(csvDirectory, csvFilename);

  fs.writeFileSync(csvFilePath, responseData);

  return csvFilePath;
});

const parseCSVToJSON = asyncHandler(async (csvFile) => {
  const results = [];
  let keys = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(csvFile, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!keys.length) {
      keys = line.split('\t');
    } else {
      const values = line.split('\t');
      const obj = {};
      keys.forEach((key, index) => {
        obj[key] = values[index];
      });
      results.push(obj);
    }
  }

  return results;
});

module.exports = {
  createReport,
  pollReportStatus,
  getReportData,
  generateDocumentUrl,
  downloadCSVReport,
  parseCSVToJSON
};
