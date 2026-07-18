const { channexRequest } = require("./channexClient");

async function updateRestrictions(payload) {
  const response = await channexRequest({
    method: "POST",
    url: "/restrictions",
    data: payload
  });

  return response;
}

module.exports = {
  updateRestrictions
};