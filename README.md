# Vee Nought Application

This README provides instructions for setting up and running the Vee Nought application locally for testing and grading purposes.

## Prerequisites

Before beginning, please install the following required software:

### 1. Install MikTeX
1. Visit https://miktex.org/download and download the installer
2. Run the installer
3. When prompted, select "Yes" for installing missing packages on the fly
4. After installation, launch the MikTeX Console
5. Click Check for updates 
6. Go to  Updates tab Click "Download now" to ensure all packages are up to date

### 2. Install Strawberry Perl
1. Visit https://strawberryperl.com/
2. Download and install the latest version using default settings

### 3. Install Java Development Kit (JDK)
If not already installed, download and install JDK 24 from:
https://www.oracle.com/java/technologies/downloads/

## Setting Up Local DynamoDB

1. Locate the "dynamodb-local" folder in the project directory
2. Open Command Prompt (cmd) with administrator privileges
3. Run the following command, adjusting paths to match your project location:

```
java -Djava.library.path=[YOUR_PROJECT_PATH]/dynamodb-local/DynamoDBLocal_lib -jar [YOUR_PROJECT_PATH]/dynamodb-local/DynamoDBLocal.jar -sharedDb -dbPath [YOUR_PROJECT_PATH]
```

Example (replace with your actual path):
```
java -Djava.library.path=C:\Users\YourUsername\path\to\vee_nought\dynamodb-local\DynamoDBLocal_lib -jar C:\Users\YourUsername\path\to\vee_nought\dynamodb-local\DynamoDBLocal.jar -sharedDb -dbPath C:\Users\YourUsername\path\to\vee_nought
```

Keep this command prompt window open while testing the application.

## (optional but recommended) Setting Up Python Environment (use pip or conda,) for example...

1. Open a new command prompt in vs code, cd into project folder
2. Create a new conda environment:
```
conda create -n kennyenv python=3.12
```
3. Activate the environment:
```
conda activate kennyenv
```

## Setting Up Client Application

3. Navigate to the client directory:
```
cd client
```
4. Install dependencies:
```
npm install --legacy-peer-deps
```
5. Build the client application:
```
npm run build
```
6. Start the development server:
```
npm run dev
```

## Setting Up Server Application

1. Open a new terminal in VS Code
2. Navigate to the server directory:
```
cd server
```
3. Install dependencies:
```
npm install --legacy-peer-deps
```
4. Start the server:
```
npm run dev
```

## Testing the Application

1. Navigate to http://localhost:3000/ in your web browser
2. Use either of the following accounts for testing:

   **Teacher Account:**
   - Username: teacher@example.com
   - Password: 35kGixye

   **Student Account:**
   - Username: student@example.com
   - Password: 35kGixye

## Troubleshooting

- If you encounter any issues with DynamoDB, ensure the command prompt running DynamoDB is still active
- For any new dependency issues, try running npm install with the --legacy-peer-deps
- Make sure all environment files (.env) are present in the repository as they contain necessary API keys 