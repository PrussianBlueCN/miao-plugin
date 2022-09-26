import fs from 'fs'
import cheerio from 'cheerio'
import fetch from 'node-fetch'
import { Data } from '../components/index.js'
import lodash from "lodash";
import request from "request";

const _path = process.cwd()

const artiIdx = {
  Flower: 1,
  Plume: 2,
  Sands: 3,
  Goblet: 4,
  Circlet: 5
}

function getEffect (txt) {
  let regRet = /(\d) Piece:/.exec(txt)
  if (regRet) {
    return [regRet[1], txt.replace(regRet[0], '').trim().replace(/。$/, '')]
  }
  return []
}

async function getSets (id) {
  const url = `https://genshin.honeyhunterworld.com/i_${id}/?lang=CHS`
  let req = await fetch(url)
  let txt = await req.text()
  let sTxt = /sortable_data.push\((.*)\)/.exec(txt)
  let ret = {}

  if (sTxt && sTxt[1]) {
    let arrs = eval(sTxt[1])
    lodash.forEach(arrs, (ds) => {
      let $ = cheerio.load(ds.join(''))
      let a = $('a:eq(1)')
      let idRet = /i_(.+)\//.exec(a.attr('href'))
      let nRet = /^(\w+)\s/.exec($('a:last').text())
      if (nRet && idRet) {
        ret[artiIdx[nRet[1]]] = {
          id: idRet[1],
          name: a.text()
        }
      }
    })
  }
  return ret
}

async function down () {
  const url = 'https://genshin.honeyhunterworld.com/fam_art_set/?lang=CHS'
  let req = await fetch(url)
  let txt = await req.text()

  let ret = {}
  let tmp = {}

  let sTxt = /sortable_data.push\((.*)\)/.exec(txt)
  if (sTxt && sTxt[1]) {
    let tmp = eval(sTxt[1])
    lodash.forEach(tmp, (ds) => {
      let na = cheerio.load(ds[0])('a:last')
      let idRet = /i_(\w+)\//.exec(na.attr('href'))
      if (idRet && idRet[1]) {
        let effect = {}
        let $ = cheerio.load(`<div>${ds[2]}</div>`)

        $('span').each(function () {
          let setRet = /(\d)-Piece:\s*(.*)。?$/.exec($(this).text())
          if (setRet && setRet[1]) {
            effect[setRet[1]] = setRet[2]
          }
        })
        tmp = {
          id: idRet[1],
          name: na.find('img').attr('alt'),
          sets: {},
          effect
        }
        ret[tmp.id] = tmp
      }
    })
  }
  let imgs = []
  for (let idx in ret) {
    let ds = ret[idx]
    ds.sets = await getSets(ds.id)
    console.log(`arti ${ds.id}:${ds.name} Done`)
    Data.createDir(`resources/meta/artifact/${ds.name}`)

    lodash.forEach(ds.sets, (s, idx) => {
      imgs.push({
        url: `img/i_${s.id}.webp`,
        file: `${ds.name}/${idx}.webp`
      })
    })
  }
  Data.createDir('resources/meta/artifact')
  Data.writeJSON('resources/meta/artifact/data.json', ret)

  const _path = process.cwd()
  const _root = _path + '/plugins/miao-plugin/'
  const _aRoot = _root + 'resources/meta/artifact/'
  await Data.asyncPool(5, imgs, async function (ds) {
    if (fs.existsSync(`${_aRoot}/${ds.file}`)) {
      // console.log(`已存在，跳过 ${ds.file}`)
      return true
    }

    try {
      let stream = fs.createWriteStream(`${_aRoot}/${ds.file}.tmp`)
      await request('https://genshin.honeyhunterworld.com/' + ds.url).pipe(stream)
      return new Promise((resolve) => {
        stream.on('finish', () => {
          fs.rename(`${_aRoot}/${ds.file}.tmp`, `${_aRoot}/${ds.file}`, () => {
            console.log(`图像下载成功: ${ds.file}`)
            resolve()
          })
        })
      })
    } catch (e) {
      console.log(`图像下载失败: ${ds.file}`)
      console.log(e)
      return false
    }
  })
}

await down()