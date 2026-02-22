# Backend Boilerplate

A Node.js backend boilerplate using Express, TypeScript, Sequelize, and PostgreSQL.

## Prerequisites

Ensure you have the following installed on your system:
- [Node.js](https://nodejs.org/) (Recommended: LTS version)
- [PostgreSQL](https://www.postgresql.org/) (Ensure it's running locally or configure a remote database)
- [Git](https://git-scm.com/)

## Installation

1. **Clone the Repository**
   ```sh
   git clone https://github.com/HassanRana009/Backend-Boilerplate.git
   cd backend-boilerplate
   ```

2. **Install Dependencies**
   ```sh
   npm install
   ```

3. **Set Up Environment Variables**
   Create a `.env` file in the root directory and configure the variables:


## Database Setup

1. **Create the PostgreSQL Database**
   ```sh
   psql -U postgres -c "CREATE DATABASE profiledb;"
   ```

2. **Run Migrations**
   ```sh
   npx sequelize-cli db:migrate
   ```

3. **(Optional) Seed the Database**
   ```sh
   npx sequelize-cli db:seed:all
   ```

## Running the Server

### Development Mode
```sh
npm run dev
```

### Production Mode
```sh
npm run build
npm start
```

## Linting & Formatting
```sh
npm run lint
npm run format
```

## Project Structure
```
backend-boilerplate/
├── src/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── config/
│   ├── middlewares/
│   ├── services/
│   ├── utils/
│   ├── index.ts
├── .env
├── package.json
├── tsconfig.json
├── README.md
```


## Troubleshooting

- **Database connection issues**: Ensure PostgreSQL is running and the credentials in `.env` are correct.
- **Sequelize errors**: Run `npx sequelize-cli db:migrate:undo:all` and re-run migrations.
- **Port conflicts**: Change the `PORT` value in `.env` if another service is using it.

## License
This project is licensed under the MIT License.

