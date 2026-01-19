# RabbitMQ Installation Playbook

This directory contains the RabbitMQ installation and configuration playbook.

## Structure

```
rabbitmq/
├── playbook.yml          # Main playbook file
└── README.md            # This file
```

## Usage

### From Command Line

```bash
ansible-playbook -i inventory.ini playbook.yml
```

## Features

- Installs RabbitMQ from official Team RabbitMQ repositories
- Enables management plugin
- Creates admin user with generated credentials
- Stores credentials in `/tmp/rabbitmq_credentials.txt`

## Credentials

Credentials are automatically generated and stored in `/tmp/rabbitmq_credentials.txt` on the target server.

