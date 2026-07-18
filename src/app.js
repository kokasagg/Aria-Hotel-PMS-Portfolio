const express = require("express");

const app = express();

const userRoutes = require("./routes/users");

const propertiesRoutes = require("./routes/properties");

const ratePlanRoutes = require("./routes/ratePlans");

const reservationRoutes = require("./routes/reservations");

const availabilityRoutes = require("./routes/availability");

const syncRoutes = require("./routes/sync");

const webhookRoutes = require("./routes/webhooks");

const guestRoutes = require("./routes/guests");

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

//Routes
app.use("/users", userRoutes);
app.use("/properties", propertiesRoutes);
app.use("/rate-plans", ratePlanRoutes);
app.use("/reservations", reservationRoutes);
app.use("/availability", availabilityRoutes);
app.use("/sync", syncRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/guests", guestRoutes);

module.exports = app;
