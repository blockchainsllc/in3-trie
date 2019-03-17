import 'mocha'
import {assert} from 'chai'
import { assertThrowsAsynchronously, populateTransactionTree, serializeTransactions} from "./testHandlers"

import verifyMerkleProof from '../src/proof'
import {rlp, keccak, toBuffer, setLengthLeft, bufferToInt} from 'ethereumjs-util'

describe('Transaction Trie Tests', async () => {

  const block = require('./testdata/block.json')
  const singleTxBlock = require('./testdata/singleTxBlock.json')

  it('Construct a merkle tree', async() => {

    const trie = await populateTransactionTree(block)
    assert.isTrue(toBuffer(block.transactionsRoot).equals(trie.root))

    const single_trie = await populateTransactionTree(singleTxBlock)
    assert.isTrue(toBuffer(singleTxBlock.transactionsRoot).equals(single_trie.root))

  })

  it('Proof of transaction existence', async () => {

    const trie = await populateTransactionTree(block)

    const txIndices = [0, block.transactions.length-1, 16, 32, 64]

    for(const index of txIndices){
      const serializedTx = serializeTransactions(block.transactions[index])
      const proof = await trie.getProof(rlp.encode(index))

      await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(index), proof, serializedTx)
    }

  })

  it('Incorrect proof of transaction existence', async () => {

    const trie = await populateTransactionTree(block)

    const txIndex = 2
    const serializedTx = serializeTransactions(block.transactions[txIndex])

    const maniProof = await trie.getProof(rlp.encode(2))
    const temp_proof = await trie.getProof(rlp.encode(64))
    maniProof[3] = temp_proof[3]

    const diffTxProof = await trie.getProof(rlp.encode(13))
    const nonExistProof = await trie.getProof(rlp.encode(block.transactions.length))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), maniProof, serializedTx)
    })

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), diffTxProof, serializedTx)
    }, "Error: Bad proof node")

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), nonExistProof, serializedTx)
    }, "Error: Bad proof node")

  })

  it('Wrong expected value against proof of transaction existence', async () => {

    const trie = await populateTransactionTree(block)

    const txIndex = 0
    const serializedTx = serializeTransactions(block.transactions[1])

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, serializedTx)
    }, "Error: The proven value was expected to be")

  })

  it('Proof of transaction non-existence', async () => {

    const trie = await populateTransactionTree(block)

    //txIndex is out of bounds
    const txIndices = [block.transactions.length, block.transactions.length +1, block.transactions.length +23]

    for(const index of txIndices) {
      const proof = await trie.getProof(rlp.encode(index))
      await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(index), proof, null)
    }

  })

  it('Incorrect proof of transaction non-existence', async () => {

    const trie = await populateTransactionTree(block)

    //txIndex is out of bounds
    const txIndex = block.transactions.length + 1

    const existProof = await trie.getProof(rlp.encode(26))

    const maniProof = await trie.getProof(rlp.encode(2))
    const temp_proof = await trie.getProof(rlp.encode(64))
    maniProof[3] = temp_proof[3]

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), maniProof, null)
    })

    await assertThrowsAsynchronously( async () => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), existProof, null)
    }, "Error: Bad proof node")

  })

  it('Wrong expected value against proof of transaction non-existence', async () => {

    const trie = await populateTransactionTree(block)

    //txIndex is out of bounds
    const txIndex = block.transactions.length + 10
    const serializedTx = serializeTransactions(block.transactions[0])

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async () => {
      await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, serializedTx)
    }, "Error: The proven value was expected to be")

  })

  it('Single transaction trie - proof of existence', async() => {
    const single_trie = await populateTransactionTree(singleTxBlock)

    const serializedTx = serializeTransactions(singleTxBlock.transactions[0])
    const proof = await single_trie.getProof(rlp.encode(0))

    await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(0), proof, serializedTx)
  })

  it('Single transaction trie - proof of non-existence', async() => {
    const single_trie = await populateTransactionTree(singleTxBlock)

    const proof = await single_trie.getProof(rlp.encode(2))

    await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(2), proof, null)
  })

  it('Single transaction trie - incorrect proofs for existence will pass', async() => {
    const single_trie = await populateTransactionTree(singleTxBlock)
    const trie = await populateTransactionTree(block)

    const nonExistProof = await single_trie.getProof(rlp.encode(1))
    const serializedTx = serializeTransactions(singleTxBlock.transactions[0])

    const maniProof = await single_trie.getProof(rlp.encode(0))
    const temp_proof = await trie.getProof(rlp.encode(64))
    maniProof[0] = temp_proof[temp_proof.length - 1]

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(0), maniProof, serializedTx)
    })

    return await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(0), nonExistProof, serializedTx)
  })

  it('Single transaction trie - incorrect proofs for non-existence will pass', async() => {
    const single_trie = await populateTransactionTree(singleTxBlock)
    const trie = await populateTransactionTree(block)

    const existProof = await single_trie.getProof(rlp.encode(0))

    const maniProof = await single_trie.getProof(rlp.encode(0))
    const temp_proof = await trie.getProof(rlp.encode(64))
    maniProof[0] = temp_proof[temp_proof.length - 1]

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(1), maniProof, null)
    })

    await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(1), existProof, null)
  })

})
