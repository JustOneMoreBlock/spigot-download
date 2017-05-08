#!/usr/bin/env node

const cloudscraper = require('cloudscraper')
const fs = require('fs')
const ora = require('ora')
const minimist = require('minimist')
const cheerio = require('cheerio')
const step = require('step')
const pretty = require('prettysize')
const path = require('path')

const argv = minimist(process.argv.slice(2), {
  alias: {
    v: 'version',
    o: 'output',
    h: 'help'
  }
})

const parseDispositionHeader = header => {
  return header.replace(/"/g, '').split('=').pop()
}

if (argv.h || !argv.id) {
  return console.log(`
  Usage: spigot-download --id <id> [-o <output path>] [-v <version>]

  Options:
  --id             Resource Id - required
  -o, --output     Output directory (default: content-disposition header) - optional
  -v, --version    Resource version (default: latest) - optional
  `)
}

if (argv.id) {
  const spinner = ora(`Fetching resource ${argv.id}...`).start()

  step(
    next => {
      const url = `https://www.spigotmc.org/resources/${argv.id}/${argv.v ? 'update?update=' + argv.v : ''}`
      cloudscraper.get(url, (err, res, body) => {
        if (err) {
          return spinner.fail(`Error fetching resource: ${err.message}`)
        }

        if (res.statusCode < 200 || res.statusCode > 400) {
          return spinner.fail(`Error fetching resource: ${res.statusCode}`)
        }

        const $ = cheerio.load(body)
        const title = $('.resourceInfo > h1').text().trim()

        spinner.succeed(`Found resource ${title}`)

        const anchor = $('.downloadButton > a')
        if (anchor.html().includes('Via external site')) {
          return spinner.fail('Downloading from external sites is not supported')
        }

        next({title, href: anchor.attr('href')})
      })
    },
    (_, { title, href }) => {
      spinner.text = 'Beginning download'
      spinner.start()

      cloudscraper.request({
        method: 'GET',
        url: `https://www.spigotmc.org/${href}`,
        encoding: null
      }, (err, res, body) => {
        if (err) {
          return spinner.fail(`Error fetching resource (while downloading): ${err.message}`)
        }

        if (res.statusCode < 200 || res.statusCode > 400) {
          return spinner.fail(`Error fetching resource (downloading): ${res.statusCode}`)
        }

        let output = parseDispositionHeader(res.headers['content-disposition'])
        if (argv.o) {
          output = argv.o
        } else if (!output) {
          // not safe, might not be a jar.
          output = path.join(__dirname, title + '.jar')
        }

        if (Buffer.isBuffer(body) && body.length) {
          fs.writeFile(output, body, 'binary', err => {
            if (err) {
              return spinner.fail(`Error saving resource: ${err.message}`)
            }

            spinner.succeed(`Saved resource ${title} (${pretty(res.headers['content-length'])}) to ${output}`)
          })
        } else {
          spinner.fail('Buffer length was zero')
        }
      })
    }
  )
}
