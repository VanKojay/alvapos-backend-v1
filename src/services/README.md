# ALVA POS MVP - Backend Services

This document provides an overview of the backend services for the ALVA POS MVP application.

## Overview

The backend provides simple supporting services for the ALVA POS MVP:

- **Database management** for quotes, customers, and products
- **Financial calculations** for pricing and discounts
- **Real-time synchronization** for multi-user scenarios
- **Simple export support** for file operations (fallback only)
- **Logging** for monitoring and debugging

## Architecture

### Core Services

1. **DatabaseService** - PostgreSQL database operations and connection management
2. **FinancialCalculationService** - Pricing, tax, and discount calculations
3. **RealTimeSyncService** - WebSocket-based real-time updates
4. **SimpleExportService** - Basic file operations for exports (fallback)
5. **ExportLoggerService** - Simple logging for export operations

### Export Strategy

The ALVA POS MVP uses a **client-side export strategy**:

- **Primary**: All export generation happens in the browser using ExcelJS and jsPDF
- **Backend**: Provides simple file storage and retrieval as a fallback mechanism
- **Benefits**: No server dependencies, immediate generation, reduced server load

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/alva_pos
DB_HOST=localhost
DB_PORT=5432
DB_USER=alva_user
DB_PASSWORD=your_password
DB_NAME=alva_pos

# Server
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:5178

# File Storage (for fallback exports)
EXPORT_STORAGE_DIR=./exports
EXPORT_CLEANUP_HOURS=24

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

## Service Details

### DatabaseService

Handles all database operations including:
- Customer management (CRUD operations)
- Quote storage and retrieval
- Product catalog management
- Template storage

### FinancialCalculationService

Provides accurate financial calculations:
- Item-level discount calculations (percentage and nominal)
- Total-level discount application
- Tax calculations
- Currency formatting and rounding

### RealTimeSyncService

Enables real-time collaboration:
- WebSocket connections for live updates
- Quote synchronization across multiple users
- Cart update broadcasting

### SimpleExportService

Basic file operations (fallback only):
- Save generated files temporarily
- Serve files for download
- Clean up old files automatically

### ExportLoggerService

Simple logging functionality:
- Log export operations
- Track performance metrics
- Debug issues

## API Integration

The backend services are exposed through RESTful APIs:

- `/api/v1/customers` - Customer management
- `/api/v1/quotes` - Quote operations
- `/api/v1/products` - Product catalog
- `/api/v1/templates` - Template management
- `/api/v1/export/health` - Export service health check

## Best Practices

1. **Client-First**: Always prefer client-side operations when possible
2. **Simple Design**: Keep services focused and minimal
3. **Error Handling**: Graceful degradation with clear error messages
4. **Performance**: Optimize database queries and minimize server load
5. **Security**: Input validation and sanitization on all endpoints

## Development

### Running Services

```bash
# Start all services
npm run dev

# Run tests
npm test

# Check types
npm run typecheck
```

### Adding New Services

1. Create service class in `/src/services/`
2. Follow singleton pattern for stateful services
3. Add appropriate error handling
4. Include logging for debugging
5. Write unit tests

## Production Considerations

- Enable HTTPS for all endpoints
- Configure proper CORS settings
- Set up database connection pooling
- Implement rate limiting
- Configure log rotation
- Set up monitoring and alerts