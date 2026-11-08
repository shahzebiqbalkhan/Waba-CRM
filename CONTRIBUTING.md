# Contributing to WABA-CRM

Thank you for your interest in contributing to **WABA-CRM**! WABA-CRM is an open-source WhatsApp Business API CRM platform built on Next.js 16 and Supabase.

Whether you're fixing a bug, improving documentation, or proposing a new feature, contributions are welcome.

---

## Code of Conduct

Please be respectful and considerate in all communications and code reviews. Treat everyone in our community with respect and empathy.

---

## Development Setup

### 1. Prerequisites
- **Node.js**: `>= 22.12.0`
- **npm**: `>= 10.9.0`
- **Supabase Account / CLI** (for local database & authentication)
- **Meta WhatsApp Business Cloud API App** (for live messaging testing)

### 2. Fork and Clone
```bash
git clone https://github.com/shahzebiqbalkhan/Waba-CRM.git
cd Waba-CRM
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment
Copy the example environment configuration:
```bash
cp .env.local.example .env.local
```
Fill in your Supabase credentials, app secret keys, and WhatsApp Cloud API tokens.

### 5. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the application.

---

## Development Guidelines

### Code Quality & Testing
- **TypeScript**: Ensure strict type safety. Run `npm run typecheck` before opening a pull request.
- **Linting & Formatting**: We use ESLint and Prettier. Run `npm run lint` and `npm run format:check`.
- **Testing**: We use Vitest. Run unit and integration tests with `npm run test`.
- **Database Migrations**: Add new SQL migration files to `supabase/migrations/` sequentially using standard naming conventions.

### Pull Request Process
1. Fork the repo and create your branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your commits clear and descriptive following conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).
3. Ensure all tests and type checks pass:
   ```bash
   npm run typecheck && npm run test
   ```
4. Push your branch and submit a Pull Request to `shahzebiqbalkhan/Waba-CRM:main`.
5. Provide a clear PR description detailing your changes, motivation, and any testing performed.

---

## Reporting Bugs & Security

- **Bugs**: Open an issue using the [Bug Report template](https://github.com/shahzebiqbalkhan/Waba-CRM/issues/new?template=bug_report.yml).
- **Security**: Please do **not** report security vulnerabilities via public issues. Refer to [SECURITY.md](./.github/SECURITY.md) for private disclosure instructions.
