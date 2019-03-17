import { assert } from 'chai'
import 'mocha'
import { readdirSync } from 'fs'
import { populateTree } from './testHandlers'
import { toBuffer } from 'ethereumjs-util'

const testDir = 'test/testdata'
const ignoreFiles = ["block.json", "singleTxBlock.json", "trietestnextprev.json", 'hex_encoded_securetrie_test.json', "trieanyorder_secureTrie.json", "trietest_secureTrie.json"]

describe('JSON-Tests', () => {
  for (const f of readdirSync(testDir)) {

    if(!ignoreFiles.includes(f)){

      describe(f, () => {
        const test = require("./testdata/" + f)

        Object.keys(test).forEach(testcase => {
          it(testcase, async() => {
            const trie = await populateTree(test[testcase])
            console.log(test[testcase].root, trie.root.toString('hex'))
            assert.isTrue(toBuffer(test[testcase].root).equals(trie.root))
          })
        })

      })

    }
  }
})
