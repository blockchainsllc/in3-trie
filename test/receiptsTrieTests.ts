import {assert} from 'chai'
const AssertionError = require('assertion-error')
import 'mocha'
import * as fs from 'fs'
import in3_trie from '../src/index'
import {rlp, keccak, toBuffer, setLengthLeft, bufferToInt} from 'ethereumjs-util'
import { serialize, util, BlockData, ReceiptData } from 'in3'
import verifyMerkleProof from '../src/proof'

const toHex = util.toHex

interface NewBlockData extends BlockData {
  receipts: ReceiptData[]
}

describe('Receipts Trie Tests', async () => {
  const block = JSON.parse(fs.readFileSync('./test/block.json', 'utf8').toString())

  it('Construct a merkle tree', async() => {

    const trie = await populateReceiptTree(block)
    assert.isTrue(toBuffer(block.receiptsRoot).equals(trie.root))

  })

  it('Proof of transaction receipt existence', async () => {

    const trie = await populateReceiptTree(block)

    const txIndices = [0, block.receipts.length-1, 16, 32, 64]

    for(const index of txIndices){
      const serializedRx = serialize.serialize(serialize.toReceipt(block.receipts[index]))
      const proof = await trie.getProof(rlp.encode(index))

      await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(index), proof, serializedRx)
    }

  })

  it('Incorrect proof of transaction receipt existence', async () => {

    const trie = await populateReceiptTree(block)

    const txIndex = 2
    const serializedRx = serialize.serialize(serialize.toReceipt(block.receipts[txIndex]))

    const maniProof = await trie.getProof(rlp.encode(2))
    const temp_proof = await trie.getProof(rlp.encode(64))
    maniProof[3] = temp_proof[3]

    const diffTxProof = await trie.getProof(rlp.encode(13))
    const nonExistProof = await trie.getProof(rlp.encode(block.receipts.length))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), maniProof, serializedRx)
    })

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), diffTxProof, serializedRx)
    }, "Error: Bad proof node")

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), nonExistProof, serializedRx)
    }, "Error: Bad proof node")

  })

  it('Wrong expected value against proof of transaction receipt existence', async () => {

    const trie = await populateReceiptTree(block)

    const txIndex = 0
    const serializedRx = serialize.serialize(serialize.toReceipt(block.receipts[1]))

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, serializedRx)
    }, "Error: The proven value was expected to be")

  })

  it('Proof of transaction receipt non-existence', async () => {

    const trie = await populateReceiptTree(block)

    //txIndex is out of bounds
    const txIndices = [block.receipts.length, block.receipts.length+1, block.receipts.length+23]

    for(const index of txIndices){
      const proof = await trie.getProof(rlp.encode(index))
      await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(index), proof, null)
    }

  })

  it('Incorrect proof of transaction receipt non-existence', async () => {

    const trie = await populateReceiptTree(block)

    //txIndex is out of bounds
    const txIndex = block.receipts.length + 1

    const existProof = await trie.getProof(rlp.encode(26))

    const maniProof = await trie.getProof(rlp.encode(2))
    const temp_proof = await trie.getProof(rlp.encode(64))
    maniProof[3] = temp_proof[3]

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), maniProof, null)
    })

    await assertThrowsAsynchronously( async () => {
      return await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), existProof, null)
    }, "Error: Bad proof node")

  })

  it('Wrong expected value against proof of transaction receipt non-existence', async () => {

    const trie = await populateReceiptTree(block)

    //txIndex is out of bounds
    const txIndex = block.receipts.length + 10
    const serializedRx = serialize.serialize(serialize.toReceipt(block.receipts[0]))

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async () => {
      await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, serializedRx)
    }, "Error: The proven value was expected to be")

  })

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

async function populateReceiptTree(block: NewBlockData): Promise<in3_trie>{

  const trie = new in3_trie()

  for(const r of block.receipts){
    if(typeof r.status != "string") r.status = r.status?"0x1":"0x0"
    if(typeof r.cumulativeGasUsed != "string") r.cumulativeGasUsed = toHex(r.cumulativeGasUsed)

    await trie.setValue(rlp.encode(r.transactionIndex), serialize.serialize(serialize.toReceipt(r)))
  }

  return trie
}
