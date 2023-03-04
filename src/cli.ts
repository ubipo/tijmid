import { Database } from "better-sqlite3";
import { Command, Option, program } from 'commander';
import chalk from 'chalk';

import { CrudConfig, CrudField, CrudFieldShown, Required } from "./crudConfig.js";
import { createDb } from "./db/create.js";
import { crudAll, crudDelete, crudInsert } from "./db/crud.js";
import { clientCrudConfig, userCrudConfig } from "./model.js";


let db: Database | null = null
async function getDb(path: string) {
  if (db == null) db = await createDb(path)
  return db
}

function objectToCliStr<T>(config: CrudConfig<T>, object: T) {
  return config.fields.map(f =>
    `${chalk.bold(f.name)}: ${chalk.green(f.toDisplayString(object))}`
  ).join('\n')
}

function objectsToCliTable<T>(config: CrudConfig<T>, objects: T[]) {
  const fields = config.fields.filter(f => f.shown === CrudFieldShown.InList)
  const headers = fields.map(f => f.name)
  const rows = objects.map(o => fields.map(f => f.toDisplayString(o)))
  const columnWidths = headers.map((h, i) =>
    Math.max(...[h, ...rows.map(row => row[i])].map(s => s.length))
  )

  const headerLine = headers.map((h, i) =>
    chalk.bold(h).padEnd(columnWidths[i])
  ).join(' | ')
  const rowLines = rows.map(row => row.map((value, i) =>
    chalk.green(value).padEnd(columnWidths[i])
  ).join(' | '))

  return [headerLine, ...rowLines].join('\n')
}

function createCrudSubcommand<T>(
  config: CrudConfig<T>,
  deleteBys: (keyof T)[] = []
) {
  const title = config.title.toLowerCase()
  const titlePlural = config.titlePlural.toLowerCase()
  const crudSubCommand = new Command(title);

  crudSubCommand
    .requiredOption('--db <db-path>', 'Path to database file')
  
  crudSubCommand
    .command('list', { isDefault: true })
    .action(async () => {
      const crudOpts = crudSubCommand.opts()
      const db = await getDb(crudOpts.db)
      const objects = crudAll(config, db)
      if (objects.length === 0) {
        console.info(chalk.italic(`No ${config.titlePlural.toLowerCase()}`))
      } else {
        console.info(objectsToCliTable(config, objects))
      }
    })
  
  const createCommand = crudSubCommand.command('create')

  for (const field of config.fields) {
    if (field.defaultVal === Required) {
      createCommand.requiredOption(`--${field.nameKebab} <${field.nameKebab}>`, field.name)
    } else if (field.defaultVal === null) {
      createCommand.option(`--${field.nameKebab} [${field.nameKebab}]`, field.name)
    }
  }

  createCommand.action(async createOpts => {
    const crudOpts = crudSubCommand.opts()
    const db = await getDb(crudOpts.db)
    const object = await config.fromParams(
      createOpts, undefined, f => f.nameCamel
    )
    await crudInsert(config, db, object)
    const idText = config.fields.filter(f => f.showForIdentification).map(
      f => `${f.name}: ${f.toDisplayString(object)}`
    ).join(' ')
    console.info(`Added ${title} with ${idText}`)
  });

  const deleteCommand = crudSubCommand
    .command('delete')

  const deleteByFields = deleteBys.map(d => config.fieldsMap[d] as CrudField<T>)
  const deleteByOptionKeyMap = Object.fromEntries(deleteByFields.map(f =>
    [`by${f.namePascal}`, f]
  ))
  const deleteByOptionKeys = Object.keys(deleteByOptionKeyMap)
  for (const [optionKey, field] of Object.entries(deleteByOptionKeyMap)) {
    deleteCommand.addOption(
      new Option(
        `--by-${field.nameKebab} <${field.name}>`,
        `Delete ${titlePlural} with exact ${field.name}`
      ).conflicts(['all', ...deleteByOptionKeys.filter(k => k != optionKey)])
    )
  }

  deleteCommand.addOption(new Option(
    '--all', `Delete all ${titlePlural}`
  ).conflicts(deleteByOptionKeys))

  deleteCommand.action(async deleteOpts => {
    const crudOpts = crudSubCommand.opts()
    const db = await getDb(crudOpts.db)
    const optKeys = Object.keys(deleteOpts)
    if (optKeys.length === 0) {
      console.error(
        `At least one of --all, ${deleteByOptionKeys.join(' ')} is requied\n`
      )
      program.outputHelp()
      process.exit(1)
    }
    if (optKeys.length > 1) throw new Error()
    const optKey = optKeys[0]
    if (optKey === 'all') {
      const deleted = crudDelete(config, db, {}, '1 = 1')
      console.info(`Deleted all ${chalk.green(deleted)} rows`)
    } else {
      const optValue = deleteOpts[optKey]
      const field = deleteByOptionKeyMap[optKey]
      const deleted = crudDelete(
        config, db, { val: optValue }, `${field.dbColumnName} = :val`
      )
      console.info(`Deleted ${chalk.green(deleted)} rows`)
    }
  })

  return crudSubCommand
}

program.addCommand(createCrudSubcommand(userCrudConfig))
program.addCommand(createCrudSubcommand(clientCrudConfig, ['id', 'name']))

await program.parseAsync()
