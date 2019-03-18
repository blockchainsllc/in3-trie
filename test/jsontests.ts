import { assert } from 'chai'
import 'mocha'
import { readdirSync } from 'fs'
import { populateTree } from './testHandlers'
import { toBuffer } from 'ethereumjs-util'

const testDir = 'test/testdata'
const ignoreFiles = ["block.json", "singleTxBlock.json", 'trietest_removed.json', 'trietest_secureTrie.json', 'trietestnextprev.json']

describe('JSON-Tests', () => {
  for (const f of readdirSync(testDir).filter(_ => !ignoreFiles.includes(_))) {

      describe(f, () => {
        const test = require("./testdata/" + f)

        Object.keys(test).forEach(testcase => {
          it(testcase, async() => {
            const trie = await populateTree(test[testcase])
            assert.isTrue(toBuffer(test[testcase].root).equals(trie.root))
          })
        })
      })
  
  }
})
