const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const cron = require("node-cron");
const logger = require("./logger/logger");
const {
  clerkMiddleware,
  clerkClient,
  requireAuth,
  getAuth,
} = require("@clerk/express");
const runWorker = require("./workers/workerHandler");
const { fetchNewTokenForFees } = require("./middlewares/lwa_token");

// Initialize app
const app = express();
app.use(express.json());

// Load env vars
dotenv.config({ path: "./.env" });

// CORS configuration
const corsOptions = {
  origin: [
    "https://top-value-brands-front-v2.vercel.app",
    "https://www.thepopro.com",
    "https://thepopro.com",
    "http://localhost:3000",
  ],
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],
  credentials: true,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Cookie Parser
app.use(cookieParser());
app.use(clerkMiddleware());

// Route files
const auth = require("./routes/auth.routes");
const products = require("./routes/products.routes");
const reports = require("./routes/reports.routes");
const users = require("./routes/users.routes");
const trackedproducts = require("./routes/trackedproducts.routes");
const suppliers = require("./routes/suppliers.routes");
const purchaseorders = require("./routes/purchaseorders.routes");
const outgoingshipment = require("./routes/shipments.routes");
const pallets = require("./routes/pallets.routes");
const amazon = require("./routes/amazon.routes");
const { swaggerDoc } = require("./routes/swagger.routes");
const loopPeticiones = require("./workers/syncProductsWorker");

// Mount routers
app.use("/api/v1/auth", auth);
app.use("/api/v1/products", products);
app.use("/api/v1/reports", reports);
app.use("/api/v1/users", users);
app.use("/api/v1/trackedproducts", trackedproducts);
app.use("/api/v1/suppliers", suppliers);
app.use("/api/v1/purchaseorders", purchaseorders);
app.use("/api/v1/shipments", outgoingshipment);
app.use("/api/v1/pallets", pallets);
app.use("/api/v1/amazon", amazon);

// Server setup
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log("DATABASE_URL_LOCAL:", process.env.DATABASE_URL_LOCAL);
  swaggerDoc(app, PORT);

  // loopPeticiones(); // <-- Aquí empieza el loop una vez

  // Cron job to sync database with Amazon
  cron.schedule(
    "55 6,12,16,20 * * *",
    async () => {
      logger.info("Starting Amazon sync cron job...");
      try {
        logger.info("Fetching new token...");
        const accessToken = await fetchNewTokenForFees();
        if (!accessToken) {
          throw new Error("Failed to fetch a valid access token.");
        }
        await runWorker("./syncWorker.js", {
          accessToken,
        });
        logger.info("Amazon sync cron job completed successfully");
        console.log("Amazon sync cron job completed successfully");
      } catch (error) {
        logger.error("Error in Amazon sync cron job:", error);
      }
    },
    {
      timezone: "America/New_York",
      scheduled: true,
    }
  );

  cron.schedule(
    "0 * * * *",
    async () => {
      console.log("Starting shipment tracking cron job...");
      logger.info("Starting shipment tracking cron job...");
      try {
        logger.info("Fetching new token...");
        const accessToken = await fetchNewTokenForFees();
        if (!accessToken) {
          throw new Error("Failed to fetch a valid access token.");
        }

        logger.info("Access token en el cronjob:", accessToken);
        await runWorker("./shipmentWorker.js", { accessToken });
        logger.info("Shipment tracking cron job completed successfully");
      } catch (error) {
        logger.error("Error in shipment tracking cron job:", error.message);
      }
    },
    {
      timezone: "America/New_York",
      scheduled: true,
    }
  );

  //  Cron job to delete old shipments
  cron.schedule(
    "0 6 * * *",
    async () => {
      console.log("Starting old shipments cleanup cron job...");
      logger.info("Starting old shipments cleanup cron job...");
      try {
        
        await runWorker("./deleteShipmentWorker.js");
        console.info("Old shipments cleanup cron job completed successfully");
      } catch (error) {
        console.error("Error in old shipments cleanup cron job:", error);
      }
    },
    {
      timezone: "America/New_York",
      scheduled: true,
    }
  );

  cron.schedule(
    "0 3,7,10,14,17,20 * * *",
    async () => {
      console.log("Starting Listing status update cron job...");
      logger.info("Starting Listing status update cron job...");
      try {
        logger.info("Fetching new token...");
        const accessToken = await fetchNewTokenForFees();
        if (!accessToken) {
          throw new Error("Failed to fetch a valid access token.");
        }

        logger.info("Access token obtained successfully");
        await runWorker("./listing_status.js", { accessToken });
        logger.info("Listing status update cron job completed successfully");
      } catch (error) {
        logger.error("Error in Listing status update cron job:", error.message);
      }
    },
    {
      timezone: "America/New_York",
      scheduled: true,
    }
  );
  
});
