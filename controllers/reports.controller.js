const asyncHandler = require('../middlewares/async')
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config({path: './.env'});

let reportId = ''

//@route   POST api/reports
//@desc    Generate new report
//@access  private

// Refactor createReport to return the reportId without sending a response
exports.createReport = asyncHandler(async (req, res, next) => {
    const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports`;

    const requestBody = {
        "reportType": "GET_MERCHANT_LISTINGS_ALL_DATA",
        "marketplaceIds": [`${process.env.MARKETPLACE_US_ID}`],
        "custom": true
    };

    const response = await axios.post(url, requestBody, {
        headers: {
            'Content-Type': 'application/json',
            'x-amz-access-token': req.headers['x-amz-access-token'] 
        }
    });
    // Return the reportId instead of sending a response
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
        reportStatus = response.data.processingStatus;
        // Wait for a short period before polling again to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds
    }
    return reportStatus;
};

// Use the reportId in getReportById to fetch and send the report
exports.getReportById = asyncHandler(async (req, res, next) => {
    // Call createReport and get the reportId
    const reportId = await this.createReport(req, res, next);
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

        // Send the report response
        return reportResponse.data
    } catch (error) {
        console.error('Error fetching report:', error);
        // Send an error response
        res.status(500).json({ message: 'Error fetching report' });
    }
});

exports.generateReport = asyncHandler(async (req, res, next) => {
    reportId = await this.getReportById(req, res, next);
    let documentId = reportId.reportDocumentId;
    const response = await axios.get(`${process.env.AMZ_BASE_URL}/reports/2021-06-30/documents/${documentId}`, {
        headers: {
            'Content-Type': 'application/json',
            'x-amz-access-token': req.headers['x-amz-access-token']
        }
    });

    let documentUrl = response.data.url;

    res.status(200).json({ documentUrl });
});


