# RRHH SOA

Sistema de recursos humanos construido con una arquitectura orientada a servicios. El proyecto separa las responsabilidades de **empleados**, **nómina** y **reclutamiento**, y ofrece un único punto de entrada para los clientes mediante un API Gateway.

La idea es sencilla: cada área puede evolucionar de forma independiente, pero para quien consume la aplicación todo está disponible desde la misma API.

## Arquitectura

```text
Cliente
  |
  | HTTP :3000
  v
API Gateway
  |-- /api/empleados       -> Servicio Empleados  -> PostgreSQL
  |-- /api/nomina          -> Servicio Nómina     -> PostgreSQL
  `-- /api/reclutamiento   -> Servicio Reclutamiento -> MongoDB
```

### Componentes

| Componente | Puerto | Responsabilidad | Persistencia |
|---|---:|---|---|
| Gateway | 3000 | Autenticación, proxy, logs, rate limiting y health check | No aplica |
| Empleados | 3001 | CRUD de empleados | PostgreSQL (`empleados_db`) |
| Nómina | 3002 | Cálculo e historial de roles de pago | PostgreSQL (`nomina_db`) |
| Reclutamiento | 3003 | Vacantes y candidatos | MongoDB (`reclutamiento_db`) |

Los servicios se comunican dentro de la red Docker `rrhh-net`. En un uso normal, el cliente debería consumir el gateway y no acceder directamente a los puertos internos.

## Requisitos

- Docker y Docker Compose.
- Node.js 18 o superior, únicamente si se desea ejecutar un servicio fuera de Docker.
- Un cliente HTTP, Postman o Insomnia.

## Puesta en marcha

Desde la raíz del proyecto:

```bash
docker compose up --build
```

Para iniciar el entorno en segundo plano:

```bash
docker compose up --build -d
```

El gateway quedará disponible en:

```text
http://localhost:3000
```

Para detener los contenedores:

```bash
docker compose down
```

Para detenerlos y eliminar también los datos persistidos:

```bash
docker compose down -v
```

> `down -v` elimina los volúmenes de PostgreSQL. Úsalo solo cuando quieras reiniciar las bases de datos desde cero.

## Autenticación

El login se realiza en el gateway y es la única ruta pública de la API:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"usuario\":\"admin\",\"password\":\"1234\"}"
```

Usuarios disponibles en esta versión de demostración:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `1234` | `admin` |
| `rrhh` | `1234` | `rrhh` |

La respuesta incluye un token JWT con una vigencia de 8 horas:

```json
{
  "token": "eyJ...",
  "usuario": "admin",
  "rol": "admin"
}
```

Para consumir una ruta protegida, envía el token en el encabezado `Authorization`:

```bash
curl http://localhost:3000/api/empleados \
  -H "Authorization: Bearer <TOKEN>"
```

El gateway aplica un límite de 100 peticiones por minuto por cliente. Las rutas protegidas requieren un JWT válido; si falta o está vencido, la respuesta será `401`.

## API disponible

Todas las rutas siguientes se consumen a través de `http://localhost:3000` y, salvo el login, requieren autenticación.

### Health checks

```text
GET /health
GET /api/empleados/health
GET /api/nomina/health
GET /api/reclutamiento/health
```

El primer endpoint confirma que el gateway está activo y muestra las URLs configuradas para los servicios. Los otros comprueban cada servicio individualmente.

### Empleados

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/empleados` | Lista empleados; acepta `?departamento=Tecnologia` |
| `GET` | `/api/empleados/:id` | Consulta un empleado por ID |
| `POST` | `/api/empleados` | Crea un empleado |
| `PUT` | `/api/empleados/:id` | Actualiza un empleado |
| `DELETE` | `/api/empleados/:id` | Lo marca como inactivo (borrado lógico) |

Ejemplo de creación:

```bash
curl -X POST http://localhost:3000/api/empleados \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"cedula\":\"0102030405\",\"nombre\":\"Ana\",\"apellido\":\"Pérez\",\"cargo\":\"Analista\",\"departamento\":\"RRHH\",\"salario_base\":850}"
```

Los campos requeridos son `cedula`, `nombre`, `apellido`, `cargo`, `departamento` y `salario_base`.

### Nómina

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/nomina/calcular` | Calcula y guarda un rol de pago |
| `GET` | `/api/nomina/:empleado_id` | Consulta el historial de nómina |
| `GET` | `/api/nomina/:empleado_id/:periodo` | Consulta un rol específico |

El período debe tener el formato `YYYY-MM`. El valor de la hora extra se calcula como:

```text
(salario_base / 240) * 1.5
```

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/nomina/calcular \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"empleado_id\":1,\"periodo\":\"2026-01\",\"salario_base\":850,\"horas_extra\":4,\"bono\":50,\"descuentos\":20}"
```

El sistema evita registrar más de una nómina para el mismo empleado y período.

### Reclutamiento

#### Vacantes

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/reclutamiento/vacantes` | Lista vacantes; acepta `?estado=abierta` |
| `GET` | `/api/reclutamiento/vacantes/:id` | Consulta una vacante |
| `POST` | `/api/reclutamiento/vacantes` | Crea una vacante |
| `PUT` | `/api/reclutamiento/vacantes/:id` | Actualiza una vacante |

Los estados permitidos para una vacante son `abierta`, `cerrada` y `pausada`.

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/reclutamiento/vacantes \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"titulo\":\"Desarrollador Node.js\",\"descripcion\":\"Desarrollo de APIs\",\"requisitos\":[\"Node.js\",\"Express\"],\"salario\":1200}"
```

#### Candidatos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/reclutamiento/candidatos` | Lista candidatos; acepta `?vacante_id=` y `?estado=` |
| `POST` | `/api/reclutamiento/candidatos` | Registra un candidato |
| `PUT` | `/api/reclutamiento/candidatos/:id/estado` | Cambia el estado de un candidato |

Los estados permitidos para un candidato son `recibido`, `en_revision`, `entrevista`, `aprobado` y `rechazado`.

## Variables de entorno

Docker Compose configura actualmente estas variables:

| Servicio | Variables principales |
|---|---|
| Gateway | `PORT`, `JWT_SECRET`, `EMPLEADOS_URL`, `NOMINA_URL`, `RECLUTAMIENTO_URL` |
| Empleados | `PORT`, `DATABASE_URL` |
| Nómina | `PORT`, `DATABASE_URL` |
| Reclutamiento | `PORT`, `MONGO_URL` |

Los valores de conexión deben apuntar a los nombres de servicio de Docker cuando se ejecuta con Compose:

```text
postgres_emp:5432/empleados_db
postgres_nom:5432/nomina_db
mongodb://mongo:27017/reclutamiento_db
```

## Ejecución local sin Docker

Cada componente tiene su propio `package.json`. Para ejecutarlo de forma independiente:

```bash
cd gateway
npm install
npm start
```

En otra terminal, repite el proceso para `services/empleados`, `services/nomina` y `services/reclutamiento`, configurando antes sus variables de entorno y teniendo PostgreSQL/MongoDB disponibles localmente.

El gateway usa estas URLs locales por defecto:

```text
EMPLEADOS_URL=http://localhost:3001
NOMINA_URL=http://localhost:3002
RECLUTAMIENTO_URL=http://localhost:3003
```

Para desarrollo, el gateway incluye:

```bash
npm run dev
```

Este comando requiere que `nodemon` esté instalado en el entorno de desarrollo.

## Estructura del proyecto

```text
.
├── docker-compose.yml
├── package.json
├── gateway/
│   ├── Dockerfile
│   └── src/
│       ├── index.js
│       ├── middlewares/auth.js
│       └── routes/auth.js
└── services/
    ├── empleados/
    │   ├── Dockerfile
    │   └── src/index.js
    ├── nomina/
    │   ├── Dockerfile
    │   └── src/index.js
    └── reclutamiento/
        ├── Dockerfile
        └── src/index.js
```