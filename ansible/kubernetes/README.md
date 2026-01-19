# Kubernetes Installation Playbook

This playbook automates the installation and configuration of Kubernetes clusters based on the StackBill deployment scripts.

## Overview

The playbook installs and configures:
- **Master/Control Plane Nodes**: Kubernetes control plane with kubeadm
- **Worker Nodes**: Kubernetes worker nodes that join the cluster
- **CNI Plugin**: Calico network plugin (v3.28.2)
- **Optional**: kubectl and Istio on a build VM

## Prerequisites

- Ubuntu 22.x servers (master and worker nodes)
- SSH access with sudo privileges
- Load balancer IP address for the control plane endpoint
- Port 6443 open in firewall for Kubernetes API
- Ports for Calico and Istio (if installed) in load balancer

## Inventory Structure

Create an inventory file with the following groups:

```ini
[master]
k8s-master-1 ansible_host=IP_ADDRESS ansible_port=22 ansible_user=ubuntu ansible_ssh_pass=PASSWORD

[worker]
k8s-worker-1 ansible_host=IP_ADDRESS ansible_port=22 ansible_user=ubuntu ansible_ssh_pass=PASSWORD

[build_vm]  # Optional
k8s-build ansible_host=IP_ADDRESS ansible_port=22 ansible_user=ubuntu ansible_ssh_pass=PASSWORD
```

## Usage

### Basic Installation

```bash
ansible-playbook -i inventory.ini playbook.yml \
  -e cluster_version=1.30 \
  -e cluster_ip=YOUR_LOAD_BALANCER_IP
```

### With Istio and kubectl on Build VM

```bash
ansible-playbook -i inventory.ini playbook.yml \
  -e cluster_version=1.30 \
  -e cluster_ip=YOUR_LOAD_BALANCER_IP \
  -e install_istio=true \
  -e install_kubectl_on_build_vm=true
```

## Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `cluster_version` | `1.30` | Kubernetes version (one release behind current) |
| `cluster_ip` | Required | Load balancer IP address for control plane endpoint |
| `pod_network_cidr` | `10.244.0.0/16` | Pod network CIDR for Calico |
| `calico_version` | `v3.28.2` | Calico CNI version |
| `istio_version` | `1.20.3` | Istio version (if installing) |
| `install_istio` | `false` | Install Istio on build VM |
| `install_kubectl_on_build_vm` | `false` | Install kubectl on build VM |

## Playbook Execution Flow

1. **Common Installation** (all nodes):
   - Disable SWAP
   - Load network modules (overlay, br_netfilter)
   - Configure sysctl parameters
   - Install containerd
   - Install Kubernetes packages (kubelet, kubeadm, kubectl)

2. **Master Initialization**:
   - Initialize cluster with kubeadm
   - Configure kubeconfig
   - Install Calico CNI plugin
   - Wait for cluster to be ready

3. **Worker Join**:
   - Get join command from master
   - Join worker nodes to cluster

4. **Build VM Setup** (optional):
   - Install kubectl
   - Copy kubeconfig from master
   - Install Istio (if enabled)

## Important Notes

1. **Kubernetes Version**: Use a version that is one release behind the current version (e.g., if current is 1.31, use 1.30)

2. **Cluster IP**: This should be the public IP of your load balancer that routes to the master node(s)

3. **Port Requirements**:
   - Port 6443: Kubernetes API (must be open)
   - Calico ports: Check after installation
   - Istio ports: Check after installation (displayed in output)

4. **Firewall**: Ensure port 6443 is allowed in your firewall settings

5. **Load Balancer**: Add port 6443 to your load balancer settings to direct traffic to the master node

## Verification

After installation, verify the cluster:

```bash
# On master node or build VM
kubectl get nodes

# Check all pods are running
kubectl get pods --all-namespaces

# Check Istio services (if installed)
kubectl get svc -n istio-system
```

## Troubleshooting

### Master node initialization fails
- Verify cluster_ip is correct and accessible
- Check port 6443 is open
- Ensure all prerequisites are met

### Worker nodes fail to join
- Verify join command is correct
- Check network connectivity between nodes
- Ensure kubelet is running on worker nodes

### Calico pods not starting
- Check pod network CIDR doesn't conflict with existing networks
- Verify network modules are loaded
- Check sysctl parameters are applied

## Based On

This playbook is based on the following scripts:
- [k8-common-installation.sh](https://stacbilldeploy.s3.us-east-1.amazonaws.com/Kubernetes/k8-common-installation.sh)
- [k8-init.sh](https://stacbilldeploy.s3.us-east-1.amazonaws.com/Kubernetes/k8-init.sh)

## License

MIT

