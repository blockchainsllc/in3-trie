import 'mocha'
import {assert} from 'chai'
import { assertThrowsAsynchronously, populateReceiptTree, serializeReceipts} from "./testHandlers"

import verifyMerkleProof from '../src/proof'
import {rlp, keccak, toBuffer, setLengthLeft, bufferToInt} from 'ethereumjs-util'

describe('Receipts Trie Tests', async () => {
  const block = require('./testdata/block.json')

  it('Construct a merkle tree', async() => {

    const trie = await populateReceiptTree(block)
    assert.isTrue(toBuffer(block.receiptsRoot).equals(trie.root))

  })

  it('Proof of transaction receipt existence', async () => {

    const trie = await populateReceiptTree(block)

    const txIndices = [0, block.receipts.length-1, 16, 32, 64]

    for(const index of txIndices){
      const serializedRx = serializeReceipts(block.receipts[index])
      const proof = await trie.getProof(rlp.encode(index))

      await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(index), proof, serializedRx)
    }

  })

  it('Incorrect proof of transaction receipt existence', async () => {

    const trie = await populateReceiptTree(block)

    const txIndex = 2
    const serializedRx = serializeReceipts(block.receipts[txIndex])

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
    const serializedRx = serializeReceipts(block.receipts[1])

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
    const serializedRx = serializeReceipts(block.receipts[0])

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async () => {
      await verifyMerkleProof(toBuffer(block.receiptsRoot), rlp.encode(txIndex), proof, serializedRx)
    }, "Error: The proven value was expected to be")

  })

})
