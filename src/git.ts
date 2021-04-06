import { exec, ExecOptions } from '@actions/exec'
import { statSync } from 'fs'
import * as core from '@actions/core'

export type GitStatus = {
  flag: string
  path: string
}

export async function gitStatus(): Promise<GitStatus[]> {
  core.debug('Getting gitStatus()')
  let output = ''
  await exec('git', ['status', '-s'], {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      },
    },
  })
  core.debug(`=== output was:\n${output}`)
  return output
    .split('\n')
    .filter(l => l != '')
    .map(l => {
      const chunks = l.trim().split(/\s+/)
      return {
        flag: chunks[0],
        path: chunks[1],
      } as GitStatus
    })
}

async function getHeadSize(path: string): Promise<number | undefined> {
  let raw = ''
  const exitcode = await exec('git', ['cat-file', '-s', `HEAD:${path}`], {
    listeners: {
      stdline: (data: string) => {
        raw += data
      },
    },
  })
  core.debug(`raw cat-file output: ${exitcode} '${raw}'`)
  if (exitcode === 0) {
    return parseInt(raw, 10)
  }
}

async function diffSize(file: GitStatus): Promise<number> {
  const stat = statSync(file.path)
  core.debug(
    `Calculating diff for ${JSON.stringify(file)}, with size ${stat.size}b`
  )
  switch (file.flag) {
    case 'M':
      // get old size and compare
      const oldSize = await getHeadSize(file.path)
      const delta = oldSize === undefined ? stat.size : stat.size - oldSize
      core.debug(
        ` ==> ${file.path} modified: old ${oldSize}, new ${stat.size}, delta ${delta}b `
      )
      return delta

    case 'A':
      core.debug(` ==> ${file.path} added: delta ${stat.size}b`)
      return stat.size

    default:
      throw new Error(
        `Encountered an unexpected file status in git: ${file.flag} ${file.path}`
      )
  }
}

export async function diff(filename: string): Promise<number> {
  const statuses = await gitStatus()
  core.debug(
    `Parsed statuses: ${statuses.map(s => JSON.stringify(s)).join(', ')}`
  )
  const status = statuses.find(s => s.path === filename)
  if (typeof status === 'undefined') {
    core.info(`No status found for ${filename}, aborting.`)
    return 0 // there's no change to the specified file
  }
  return await diffSize(status)
}
