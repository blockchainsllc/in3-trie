import {assert} from 'chai'
const AssertionError = require('assertion-error')
import 'mocha'
import * as fs from 'fs'
import in3_trie from '../src/index'
import {rlp, keccak, toBuffer, setLengthLeft, bufferToInt} from 'ethereumjs-util'
import { serialize, util } from 'in3'
import verifyMerkleProof from '../src/proof'

const toHex = util.toHex

describe('Receipts Trie Tests', async () => {

  const trie = new in3_trie()
  const block = JSON.parse(fs.readFileSync('./test/block.json', 'utf8').toString())

  it('Construct a merkle tree', async() => {
    for(const r of block.receipts){
      r.status = r.status?"0x1":"0x0"
      r.cumulativeGasUsed = '0x' + r.cumulativeGasUsed.toString(16)
      const serializedRx = serialize.serialize(serialize.toReceipt(r))
      await trie.setValue(rlp.encode(r.transactionIndex), serializedRx)
    }

    assert.equal(block.receiptsRoot,'0x' + trie.root.toString('hex'))
  })

  it('Proof of transaction receipt existence', async () => {
    const txIndex = randomIndex(0, block.receipts.length)
    const rx = block.receipts[txIndex]
    const serializedRx = serialize.serialize(serialize.toReceipt(rx))
    const proof = await trie.getProof(rlp.encode(txIndex))

    await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, serializedRx)
  })

  it('Incorrect proof of transaction receipt existence', async () => {
    const txIndex = randomIndex(0, block.receipts.length)
    const rx = block.receipts[txIndex]
    const serializedRx = serialize.serialize(serialize.toReceipt(rx))

    //index+1 because youare generating a incorrect proof or proof for the next transaction and not the current one
    const proof = await trie.getProof(rlp.encode(randomIndex(txIndex + 1, block.receipts.length*20)))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex),proof, serializedRx)
    }, "Error: Bad proof node")
  })

  it('Wrong expected value against proof of transaction receipt existence', async () => {
    const txIndex = randomIndex(0, block.receipts.length)

    const rx = block.receipts[txIndex + 1]
    const serializedRx = serialize.serialize(serialize.toReceipt(rx))

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, serializedRx)
    }, "Error: The proven value was expected to be")
  })

  it('Proof of transaction receipt non-existence', async () => {
    //txIndex is out of bounds
    const txIndex = randomIndex(block.receipts.length, block.receipts.length*2)
    const proof = await trie.getProof(rlp.encode(txIndex))

    await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, null)
  })

  it('Incorrect proof of transaction receipt non-existence using in bounds index', async () => {
    //txIndex is out of bounds
    const txIndex = randomIndex(block.receipts.length, block.receipts.length*2)
    const proof = await trie.getProof(rlp.encode(txIndex - block.receipts.length))

    await assertThrowsAsynchronously( async () => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, null)
    }, "Error: Bad proof node")
  })

  it('Wrong expected value against proof of transaction receipt non-existence', async () => {
    //txIndex is out of bounds
    const txIndex = randomIndex(block.receipts.length, block.receipts.length*2)
    const rx = block.receipts[txIndex-block.receipts.length]
    const serializedRx = serialize.serialize(serialize.toReceipt(rx))

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async () => {
      await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, serializedRx)
    }, "Error: Key does not match with the proof one (extention|leaf)")
  })

  it('Wrong expected value(undefined) against proof of transaction receipt non-existence', async () => {
    //txIndex is out of bounds
    const txIndex = randomIndex(block.receipts.length, block.receipts.length*2)
    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async () => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, undefined)
    }, "Error: Key does not match with the proof one (extention|leaf)")
  })

  // it('Negative index transaction proofs', async () => {
  //   const txIndex = -1
  //   //index+1 because youare generating a incorrect proof or proof for the next transaction and not the current one
  //   const proof = await trie.getProof(rlp.encode(txIndex))
  //
  //   await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, null)
  // })

  // it('Single node tx trie proofs', async() => {
  //
  // })

})

function randomIndex(min: number, max: number) {
  return Math.floor(Math.random() * (+max - +min)) + +min
}

async function assertThrowsAsynchronously(test, error?: string) {
    try {
        await test();
    } catch(e) {
        if (!error)
          return true
        else if (e.toString().startsWith(error))
          return true
    }
    throw new AssertionError("Missing rejection" + (error ? " with "+error : ""));
}
