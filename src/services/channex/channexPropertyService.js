const { channexRequest } = require("./channexClient");

// =============================
// BUILD PROPERTY CREATE PAYLOAD FOR CHANNEX PROPERTY
// =============================
function buildPropertyPayload(body) {
  return {
    property: {
      title: body.name,
      currency: body.currency || "EUR",
      email: body.email || null,
      phone: body.phone || null,
      country: body.country || "GR",
      city: body.city,
      address: body.address,
      zip_code: body.postal_code,
    },
  };
}

// =============================
// BUILD PROPERTY UPDATE PAYLOAD FOR CHANNEX PROPERTY
// =============================
function buildPropertyUpdatePayload(body) {
  const property = {};

  if (body.name !== undefined) property.title = body.name;
  if (body.currency !== undefined) property.currency = body.currency;
  if (body.email !== undefined) property.email = body.email;
  if (body.phone !== undefined) property.phone = body.phone;
  if (body.postal_code !== undefined) property.zip_code = body.postal_code;
  if (body.country !== undefined) property.country = body.country;
  if (body.city !== undefined) property.city = body.city;
  if (body.address !== undefined) property.address = body.address;

  if (body.property_type_code !== undefined) {
    property.property_type = body.property_type_code;
  }

  return { property };
}

// =============================
// CREATE CHANNEX PROPERTY
// =============================
async function createProperty(property) {
  const payload = buildPropertyPayload(property);

  const response = await channexRequest({
    method: "POST",
    url: "/properties",
    data: payload,
  });

  return {
    payload,
    response,
  };
}

// =============================
// GET CHANNEX PROPERTY
// =============================
async function getProperty(channex_property_id) {
  const response = await channexRequest({
    method: "GET",
    url: `/properties/${channex_property_id}`,
  });

  return response;
}

// =============================
// UPDATE CHANNEX PROPERTY
// =============================
async function updateProperty(channex_property_id, body) {
  const payload = buildPropertyUpdatePayload(body);

  const response = await channexRequest({
    method: "PUT",
    url: `/properties/${channex_property_id}`,
    data: payload,
  });

  return {
    payload,
    response,
  };
}

module.exports = {
  buildPropertyPayload,
  buildPropertyUpdatePayload,
  createProperty,
  getProperty,
  updateProperty,
};
