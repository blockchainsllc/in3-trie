import { assert } from 'chai'
import 'mocha'
import * as fs from 'fs'
import in3_trie from '../src/index'
import {rlp, keccak, toBuffer, setLengthLeft} from 'ethereumjs-util'
import { serialize } from 'in3'
import verifyMerkleProof from '../src/proof'

async function main() {

  const trie = new in3_trie()
  const block = JSON.parse(fs.readFileSync('./test/block.json', 'utf8').toString())

  for(const tx of block.transactions){
    await trie.setValue(rlp.encode(tx.transactionIndex), serialize.createTx(tx).serialize())
  }

  if (block.transactionsRoot !== '0x' + trie.root.toString('hex'))
    throw new Error('The transactionHash is wrong! : \n' + block.transactionsRoot + '!==\n0x' + trie.root.toString('hex'))

  const txIndex = randomIndex(0, block.transactions.length)
  const transaction = block.transactions[txIndex]
  const proof = await trie.getProof(rlp.encode(txIndex))

  console.log(await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, serialize.createTx(transaction).serialize()))
}

function randomIndex(min: number, max: number) {
  return Math.floor(Math.random() * (+max - +min)) + +min
}

main()
