#!/bin/sh
mkdir -p $HOME/data/postgres
docker run -d --name consequent-pg \
    -e POSTGRES_USER=consequent \
    -e POSTGRES_PASSWORD=pgadmin \
    -p 5432:5432 \
    -v $HOME/data/postgres/:/var/lib/postgresql/data \
    postgres:14-alpine
