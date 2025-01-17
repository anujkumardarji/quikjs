#!/usr/bin/env node

import template from "./templates/content.js";
import { append, read, write } from "./utils/fs.js";
import { orms } from "./constants.js";
import prisma from "./plugins/prisma/index.js";
import format from "./utils/format.js";
import { ask } from "./utils/prompt.js";
import sequelize from "./plugins/sequelize/index.js";

let state;
let tables = [];

const loadState = async (input) => {
  try {
    const config = read("config.json");
    if (config.length !== 0) {
      state = JSON.parse(config);
    }
  } catch (error) {
    state = input;
  }
};

async function setupPrisma(serviceName, model, db) {
  try {
    prisma.model(serviceName, model, db);
    await prisma.generate();
  } catch (error) {
    console.log("Error setting up Prisma:", error);
  }
}


function isArrayNotEmpty(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

async function setupSequalize(serviceName, model, relations = []) {
  try {
    await sequelize.model(serviceName, model);
    if (isArrayNotEmpty(relations))
      generateAssociations(serviceName, relations);
    console.log("Model generation complete - "+serviceName);
  } catch (error) {
    console.log("Error setting up Prisma:", error);
  }
}

function generateAssociations(modelName, relations = []) {
  relations.forEach(({ model_name, relation_type }) => {
    const associationCode = generateAssociationCode(
      modelName,
      model_name,
      relation_type
    );
    appendToFile(`${modelName}.js`, associationCode);
    appendToFile(
      `${model_name}.js`,
      generateInverseAssociationCode(modelName, model_name, relation_type)
    );
  });
}

function generateAssociationCode(modelName, relatedModelName, type) {
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
  let associationCode = `// Define association with ${capitalize(relatedModelName)}\n\n  const ${capitalize(relatedModelName)} = require('./${relatedModelName.toLowerCase()}');
\n\n  `;
  if (type.toLowerCase() === "one-to-many") {
    associationCode += `${capitalize(modelName)}.hasMany(${capitalize(relatedModelName)});
\n`;
  } else if (type.toLowerCase() === "many-to-one") {
    associationCode += `${capitalize(modelName)}.belongsTo(${capitalize(relatedModelName)});
\n`;
  } else if (type.toLowerCase() === "many-to-many") {
    associationCode += `${capitalize(modelName)}.belongsToMany(${capitalize(relatedModelName)});
\n`;
  } else if (type.toLowerCase() === "one-to-one") {
    associationCode += `${capitalize(modelName)}.hasOne(${capitalize(relatedModelName)});
\n`;
  }
  return associationCode;
}

function generateInverseAssociationCode(modelName, relatedModelName, type) {
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
  let inverseAssociationCode = `// Define inverse association with ${capitalize(modelName)}\n\n  const ${capitalize(modelName)} = require('./${modelName.toLowerCase()}');
\n\n  `;
  if (type.toLowerCase() === "one-to-many") {
    inverseAssociationCode += `${capitalize(relatedModelName)}.belongsTo(${capitalize(modelName)});
\n`;
  } else if (type.toLowerCase() === "many-to-one") {
    inverseAssociationCode += `${capitalize(relatedModelName)}.hasMany(${capitalize(modelName)});
\n`;
  } else if (type.toLowerCase() === "many-to-many") {
    inverseAssociationCode += `${capitalize(relatedModelName)}.belongsToMany(${capitalize(modelName)});
\n`;
  } else if (type.toLowerCase() === "one-to-one") {
    inverseAssociationCode += `${capitalize(relatedModelName)}.hasOne(${capitalize(modelName)});
\n`;
  }
  return inverseAssociationCode;
}

function appendToFile(fileName, content) {
  append(`models/${fileName}`, content);
}

function authMiddleware(roles) {
  if (state.authentication && roles.length) {
    return `userAuth, checkRole(${JSON.stringify(roles)}), `;
  } else if (state.authentication) {
    return "userAuth, ";
  }
  return "";
}

function generateRoutes(routeName, roles) {
  write(`routes/${routeName}.js`, template.routesContent(routeName));
  const importContent = `const ${routeName}Routes = require("./routes/${routeName}");`;
  const routeContent = `app.use("/api/${routeName}",${authMiddleware(roles)}${routeName}Routes);`;
  let mainFileContent = read("app.js");
  let lines = mainFileContent.split("\n");
  const importRoutesIndex = lines.findIndex((line) =>
    line.includes("// Import routes")
  );
  if (
    importRoutesIndex !== -1 &&
    !lines.some((line) => line.includes(importContent))
  ) {
    lines.splice(importRoutesIndex + 1, 0, importContent);
    write("app.js", lines.join("\n"));
  }

  const useRoutesIndex = lines.findIndex((line) => line.includes("// Routes"));
  if (
    useRoutesIndex !== -1 &&
    !lines.some((line) => line.includes(routeContent))
  ) {
    lines.splice(useRoutesIndex + 1, 0, routeContent);
    write("app.js", lines.join("\n"));
  }
}

function updateState(data) {
  console.log("Updating project state");
  let config = read("config.json");
  config = JSON.parse(config);
  config.models.push(data);
  console.log(config);
  write("config.json", JSON.stringify(config));
  return config;
}

async function generateScaffold(
  serviceName,
  model,
  relations = [],
  roles = []
) {
  try {
    const db = state.db;
    const orm = state.orm;
    switch (orm) {
      case "prisma":
        await setupPrisma(serviceName, model, db);
        prisma.controller(serviceName);
        break;
      case "sequelize":
        await setupSequalize(serviceName, model, relations);
        sequelize.controller(serviceName);
        break;
    }
    generateRoutes(serviceName, roles);
    console.log("Generated routes and controllers for ",serviceName);
  } catch (error) {
    console.error("Error generating scaffold:", error);
  }
}

async function scaffold(input) {
  try {
    await loadState(input);
    // const schemaData = await promptSchemaModel(input);
    const schemaData = {
      country: [
        {
          name: "id",
          type: "INTEGER",
          defaultValue: "",
          primaryKey: true,
          allowNulls:false,
          unique: true,
          autoIncrement: true,
          foreignKey: false,
          add_another: true,
        },
        {
          name: "name",
          type: "STRING",
          size: "",
          defaultValue: "",
          primaryKey: false,
          allowNulls: false,
          unique: false,
          autoIncrement: false,
          foreignKey: false,
          add_another: false,
        },
      ],
      employee: [
        {
          name: "id",
          type: "INTEGER",
          defaultValue: "",
          primaryKey: true,
          autoIncrement: true,
          foreignKey: false,
          add_another: true,
        },
        {
          name: "name",
          type: "TEXT",
          defaultValue:"",
          primaryKey: false,
          allowNulls: false,
          unique: false,
          autoIncrement: false,
          foreignKey: false,
          add_another: true,
        },
        {
          name: "country_id",
          type: "INTEGER",
          defaultValue: "",
          primaryKey: false,
          allowNulls: false,
          unique: false,
          autoIncrement: false,
          foreignKey: true,
          refTable: "country",
          refField: "id",
          relationshipType: "Many-to-One",
          add_another: true,
        },
        {
          name: "start_date",
          type: "DATE",
          defaultValue: "",
          primaryKey: false,
          allowNulls: false,
          unique: false,
          autoIncrement: false,
          foreignKey: false,
          add_another: false,
        },
      ],
    };
    if (Object.keys(schemaData).length) {
      for (const [key, value] of Object.entries(schemaData)) {
        await generateScaffold(key, value);
      }
    }
    // let relations = isArrayNotEmpty(relations) ? relations : [];
    const { name, description, db, orm, authentication, roles } = input;
    const config = {
      name,
      description,
      db,
      orm,
      authentication,
      roles,
      schemaData,
    };
    write("config.json", JSON.stringify(config),{parser: "json"});
  } catch (err) {
    console.error(err);
    console.error("something went wrong");
  }
}

export { scaffold };
