#!/usr/bin/env node

import inquirer from "inquirer";
import { appTemplate } from "./templates/app.js";
import passport from "./templates/passport.js";
import aws from "./templates/aws.js";
import twilio from "./templates/twilio.js";
import { createDirectory, read, write } from "./utils/fs.js";
import format from "./utils/format.js";
import { installSync } from "./utils/install.js";
import { scaffold, promptSchemaModel } from "./generate.js";
// import { ask } from "./utils/prompt.js";
import prisma from "./plugins/prisma/prisma.js";
import sequelize from "./plugins/sequelize/sequelize.js";
import mongoose from "./plugins/mongoose/mongoose.js";
import { tools } from "./constants.js";
import compile from "./utils/compile.js";

let userModel;
let models = [];

async function runORMSetup(orm, db) {
  console.log(`Setting up ${orm}`);
  const ormSetupFunctions = {
    prisma: prisma.setup,
    sequelize: sequelize.setup,
    mongoose: mongoose.setup,
  };
  if (!ormSetupFunctions[orm]) {
    throw new Error(`Unsupported ORM: ${orm}`);
  }
  await ormSetupFunctions[orm](db);
}

async function generateProjectStructure(input) {
  try {
    const { db, orm, tools, authentication, logging, error_handling } = input;

    const folders = [
      "controllers",
      "models",
      "routes",
      "middlewares",
      "utils",
      "config",
    ];

    const files = [
      { path: "app.js", content: compile(appTemplate)({ input }) },
      { path: ".env", content: "" },
      { path: ".gitignore", content: "node_modules\n.env\n" },
      { path: "README.md", content: "# Your Project Name\n\nProject documentation goes here." },
    ];

    const toolFiles = {
      "s3": [
        { path: "config/aws.js", content: aws.s3.config(input) },
        { path: "utils/s3.js", content: aws.s3.utils(input) }
      ],
      "sns": [{ path: "utils/sns.js", content: aws.sns(input) }],
      "twilio": [{ path: "utils/twilio.js", content: twilio(input) }]
    };

    if (tools.length) {
      tools.forEach((tool) => {
        files.push(...(toolFiles[tool] || []));
      });
    }

    if (authentication) {
      files.push(
        { path: "middlewares/passport.js", content: passport.middleware },
        { path: "utils/auth.js", content: passport.util(input, userModel) }
      );
    }

    if (logging) {
      files.push({ path: "access.log", content: "" });
    }

    if (error_handling) {
      files.push({ path: "error.log", content: "" });
    }

    folders.forEach(createDirectory);

    await Promise.all(files.map(async (file) => {
      const formattedContent = [".env", "README.md", ".gitignore", "prisma/schema.prisma"].includes(file.path)
        ? file.content
        : await format(file.content);

      write(file.path, formattedContent);
    }));

    await runORMSetup(orm, db);
  } catch (error) {
    console.error("Error creating project structure:", error);
  }
}


async function installDependencies(answers) {
  console.log("Installing dependencies");
  installSync("express", "cors", "dotenv", "helmet", "morgan", "compression");
  switch (answers.db) {
    case "postgresQL":
      installSync("pg", "pg-hstore");
      break;
    case "mySQL":
      installSync("mysql2");
      break;
  }
  if (answers.authentication) {
    console.log("Setting up  passport,passport-jwt");
    installSync("passport", "passport-jwt", "jsonwebtoken", "bcrypt");
  }
  if (answers.tools.length) {
    for (const item of answers.tools) {
      switch (item) {
        case "s3":
        case "sns":
          installSync("aws-sdk");
          break;
        case "twilio":
          installSync("twilio");
      }
    }
  }
}

async function CheckProjectExist() {
  try {
    const data = await read("config.json");
    if (data) {
      const config = JSON.parse(data);
      if (!config?.name) {
        console.log("Config file is empty or missing name property");
      }
      if (answers.name === config.name) {
        console.log("Project already created");
        return;
      }
    }
  } catch (error) {
    console.log("Initializing project setup");
  }
}

async function getRoleInput() {
  try {
    const roleAnswers = [];
    let confirm = true;
    while (confirm) {
      const { addRole } = await inquirer.prompt([
        {
          type: "confirm",
          name: "addRole",
          message: "Do you want to add a role?",
          default: true,
        },
      ]);
      if (!addRole) {
        confirm = false;
      }
      const { role } = await inquirer.prompt([
        { type: "input", name: "role", message: "Enter the role:" },
      ]);
      roleAnswers.push(role);
    }
    return roleAnswers;
  } catch (error) {
    console.error("Error getting role input:", error);
    throw error;
  }
}

async function main() {
  try {
    // const answers = await ask(projectQuestions);
    const answers = {
      name: "todos",
      description: "",
      db: "postgresql",
      orm: "prisma",
      logging: true,
      error_handling: true,
      tools: ["none"],
      authentication: false,
    };
    await CheckProjectExist();
    if (answers.authentication) {
      if (answers.roles) answers.roles = await getRoleInput();
      console.log("Let us create User model with required fields");
      const userModel = await promptSchemaModel(answers, "user");
      const name = "user";
      switch (answers.orm) {
        case "prisma":
          prisma.model(name, userModel, answers.db);
          break;
        case "sequelize":
          sequelize.mod(name, userModel);
          break;
      }
    }
    // installDependencies(answers);
    await generateProjectStructure(answers);
    console.log("Started generating scaffold...");
    await scaffold(answers);
    if (userModel) models.push({ name: "user", model: userModel });
    console.log("Project setup successful\n");
  } catch (error) {
    console.log(error);
    console.log("Unable to generate project.");
  }
}

console.time("Time taken");
await main();
console.timeEnd("Time taken");
