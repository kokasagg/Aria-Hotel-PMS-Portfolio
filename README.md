# Aria Hotel PMS

Backend Property Management System (PMS) developed with Node.js, Express.js and Microsoft SQL Server.

The project is built around a multi-tenant architecture and integrates with the Channex API to manage hospitality data through secure RESTful APIs. It was developed as a portfolio project to demonstrate backend software development, API integration, authentication, authorization and relational database design.

---

## Features

- Multi-tenant backend architecture
- RESTful API development
- JWT Authentication
- Role-Based Authorization
- User Management
- Property Management
- Reservation Management
- Channex API Integration
- Input Validation
- Error Handling
- Microsoft SQL Server Database

---

## Tech Stack

### Backend
- Node.js
- Express.js
- JavaScript

### Database
- Microsoft SQL Server

### Authentication
- JWT Authentication

### Tools
- Git
- Postman
- DBeaver
- Visual Studio Code

### External API
- Channex API

---

## Project Structure

```
src/
├── config/
├── controllers/
├── database/
├── middleware/
├── routes/
├── services/
└── utils/
```

---

## Getting Started

Clone the repository

```bash
git clone https://github.com/kokasagg/Aria-Hotel-PMS-Portfolio.git
```

Install dependencies

```bash
npm install
```

Create a `.env` file

```env
PORT=

DB_SERVER=
DB_DATABASE=
DB_USER=
DB_PASSWORD=

JWT_SECRET=
```

Run the application

```bash
npm run dev
```

---

## API Documentation

Complete API documentation is available in the **docs** folder.

---

## Roadmap

Planned improvements:

- Frontend application
- Reservation calendar improvements
- Additional reservation filters
- Unit testing
- Docker support
- CI/CD pipeline

---

## Author

**Angelos Kokaropoulos**

LinkedIn: https://www.linkedin.com/in/angelos-kokaropoulos-65973b226/

GitHub: https://github.com/kokasagg
