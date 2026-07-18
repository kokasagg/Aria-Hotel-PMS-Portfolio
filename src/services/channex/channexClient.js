const axios = require("axios");

const CHANNEX_BASE_URL = process.env.CHANNEX_BASE_URL;
const CHANNEX_API_KEY = process.env.CHANNEX_API_KEY;

const channexClient = axios.create({
  baseURL: CHANNEX_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "user-api-key": CHANNEX_API_KEY,
  },
});

async function channexRequest(config) {
  try {
    const response = await channexClient.request(config);
    console.log(
      "CHANNEX REQUEST:",
      config.method,
      config.url
    );
    return response.data;
  } catch (err) {
    console.log("CHANNEX ERROR:", JSON.stringify(err.response?.data, null, 2));

    const message =
      err.response?.data?.errors?.title ||
      err.response?.data?.message ||
      err.message ||
      "Channex request failed";

    const error = new Error(message);
    error.statusCode = err.response?.status || 500;
    error.response = err.response?.data || null;

    throw error;
  }
}

module.exports = {
  channexRequest,
};
