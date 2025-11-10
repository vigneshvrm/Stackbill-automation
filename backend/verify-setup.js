#!/usr/bin/env node

/**
 * Verification script to check if the environment is set up correctly
 */

const { exec } = require('child_process');
const os = require('os');
const util = require('util');

const execPromise = util.promisify(exec);

const IS_WINDOWS = process.platform === 'win32';

async function checkCommand(command, description) {
  try {
    const { stdout, stderr } = await execPromise(command);
    console.log(`✅ ${description}: OK`);
    if (stdout.trim()) {
      console.log(`   ${stdout.trim().split('\n')[0]}`);
    }
    return true;
  } catch (error) {
    console.log(`❌ ${description}: FAILED`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Verifying StackBill Ansible Setup...\n');
  console.log(`Platform: ${process.platform}`);
  console.log(`Node.js: ${process.version}\n`);

  let allChecks = true;

  // Check Node.js dependencies
  console.log('📦 Checking Node.js dependencies...');
  try {
    require('express');
    console.log('✅ Express: OK');
  } catch (error) {
    console.log('❌ Express: NOT INSTALLED');
    console.log('   Run: npm install');
    allChecks = false;
  }

  console.log('\n🔧 Checking Ansible...');
  
  if (IS_WINDOWS) {
    console.log('   (Windows detected - checking WSL)');
    
    // Check WSL
    const wslCheck = await checkCommand('wsl --list --verbose', 'WSL Installation');
    if (!wslCheck) {
      console.log('   💡 Install WSL: wsl --install');
      allChecks = false;
    } else {
      // Check Ansible in WSL
      const ansibleCheck = await checkCommand('wsl ansible --version', 'Ansible in WSL');
      if (!ansibleCheck) {
        console.log('   💡 Install Ansible in WSL: wsl sudo apt-get install ansible sshpass');
        allChecks = false;
      }
      
      // Check sshpass in WSL
      const sshpassCheck = await checkCommand('wsl which sshpass', 'sshpass in WSL');
      if (!sshpassCheck) {
        console.log('   💡 Install sshpass in WSL: wsl sudo apt-get install sshpass');
        allChecks = false;
      }
    }
  } else {
    // Linux/Mac
    const ansibleCheck = await checkCommand('ansible --version', 'Ansible');
    if (!ansibleCheck) {
      console.log('   💡 Install Ansible: sudo apt-get install ansible (Ubuntu/Debian)');
      console.log('                      brew install ansible (macOS)');
      allChecks = false;
    }
    
    const sshpassCheck = await checkCommand('which sshpass', 'sshpass');
    if (!sshpassCheck) {
      console.log('   💡 Install sshpass: sudo apt-get install sshpass (Ubuntu/Debian)');
      console.log('                      brew install hudochenkov/sshpass/sshpass (macOS)');
      allChecks = false;
    }
  }

  console.log('\n📁 Checking project structure...');
  const fs = require('fs');
  const path = require('path');
  
  const requiredFiles = [
    'backend/api-server.js',
    'package.json',
    'ansible/playbooks/mysql.yml',
    'ansible/playbooks/mongodb.yml',
    'ansible/playbooks/nfs.yml',
    'ansible/playbooks/rabbitmq.yml'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file}: OK`);
    } else {
      console.log(`❌ ${file}: NOT FOUND`);
      allChecks = false;
    }
  }

  console.log('\n' + '='.repeat(50));
  if (allChecks) {
    console.log('✅ All checks passed! You\'re ready to go.');
    console.log('   Start the server with: npm start');
  } else {
    console.log('❌ Some checks failed. Please fix the issues above.');
  }
  console.log('='.repeat(50));
}

main().catch(console.error);

