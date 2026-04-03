FROM postgres:16-alpine

COPY 01_init.sql /docker-entrypoint-initdb.d/
# COPY 02_seed.sql /docker-entrypoint-initdb.d/

EXPOSE 5432