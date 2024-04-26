const asyncHandler = require('../middlewares/async')
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

dotenv.config({path: './.env'});

let reportId = ''

//@route   POST api/reports
//@desc    Generate new report
//@access  private

// Refactor createReport to return the reportId without sending a response
exports.createReport = asyncHandler(async (req, res, next) => {
    const url = `${process.env.AMZ_BASE_URL}/reports/2021-06-30/reports`;

    const requestBody = {
        "reportType": "GET_FBA_MYI_ALL_INVENTORY_DATA",
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
        res.status(200).json(reportResponse.data);
    } catch (error) {
        console.error('Error fetching report:', error);
        // Send an error response
        res.status(500).json({ message: 'Error fetching report' });
    }
});

exports.generateReport = asyncHandler(async (req, res, next) => {
    const rptId = 'amzn1.spdoc.1.4.na.02550d59-bfa8-4b7d-832b-d2c77a03a299.TN7Q4D0SLTJWC.2650';
    try {
        const apiResponse = await axios.get(`https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${rptId}`, {
            headers: {
                'x-amz-access-token': req.headers['x-amz-access-token']
            }
        });

        const responseData = apiResponse.data; // Accessing response data
        if (responseData.url) {
            const url = responseData.url;
            console.log(url);
            const resp = await axios.get(url, { responseType: 'arraybuffer' });
            let respData = resp.data;

            if (responseData.compressionAlgorithm) {
                try {
                    respData = require('zlib').gunzipSync(respData);
                } catch (e) {
                    console.error(e);
                    return res.status(500).send('Error while decompressing data');
                }
            }

            // Define directory to save CSV files
            const csvDirectory = path.resolve('./reports');
            if (!fs.existsSync(csvDirectory)) {
                fs.mkdirSync(csvDirectory);
            }

            // Generate unique filename for CSV file
            const timestamp = Date.now();
            const csvFilename = `report_${timestamp}.csv`;
            const csvFilePath = path.join(csvDirectory, csvFilename);

            // Write CSV data to file
            fs.writeFileSync(csvFilePath, respData);

            return res.send(`CSV file saved: ${csvFilePath}`);
        } else {
            return res.status(404).send('Report URL not found');
        }
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
});


