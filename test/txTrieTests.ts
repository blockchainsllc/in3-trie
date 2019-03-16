import {assert} from 'chai'
const AssertionError = require('assertion-error')
import 'mocha'
import * as fs from 'fs'
import in3_trie from '../src/index'
import {rlp, keccak, toBuffer, setLengthLeft, bufferToInt} from 'ethereumjs-util'
import { serialize, util, BlockData} from 'in3'
import verifyMerkleProof from '../src/proof'

const toHex = util.toHex

describe('Transaction Trie Tests', async () => {

  const block = JSON.parse(fs.readFileSync('./test/block.json', 'utf8').toString())
  const singleTxBlock = JSON.parse(fs.readFileSync('./test/singleTxBlock.json', 'utf8').toString())

  it('Construct a merkle tree', async() => {

    const trie = await populateTree(block)
    assert.isTrue(toBuffer(block.transactionsRoot).equals(trie.root))

    const single_trie = await populateTree(singleTxBlock)
    assert.isTrue(toBuffer(singleTxBlock.transactionsRoot).equals(single_trie.root))

  })

  it('Proof of transaction existence', async () => {

    const trie = await populateTree(block)

    const txIndices = [0, block.transactions.length-1, 16, 32, 64]

    for(const index of txIndices){
      const serializedTx = serialize.serialize(serialize.toTransaction(block.transactions[index]))
      const proof = await trie.getProof(rlp.encode(index))

      await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(index), proof, serializedTx)
    }

  })

  it('Incorrect proof of transaction existence', async () => {

    const trie = await populateTree(block)

    const txIndex = 2
    const serializedTx = serialize.serialize(serialize.toTransaction(block.transactions[txIndex]))

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

    const trie = await populateTree(block)

    const txIndex = 0
    const serializedTx = serialize.serialize(serialize.toTransaction(block.transactions[1]))

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, serializedTx)
    }, "Error: The proven value was expected to be")

  })

  it('Proof of transaction non-existence', async () => {

    const trie = await populateTree(block)

    //txIndex is out of bounds
    const txIndices = [block.transactions.length, block.transactions.length +1, block.transactions.length +23]

    for(const index of txIndices) {
      const proof = await trie.getProof(rlp.encode(index))
      await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(index), proof, null)
    }

  })

  it('Incorrect proof of transaction non-existence', async () => {

    const trie = await populateTree(block)

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

    const trie = await populateTree(block)

    //txIndex is out of bounds
    const txIndex = block.transactions.length + 10
    const serializedTx = serialize.serialize(serialize.toTransaction(block.transactions[0]))

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async () => {
      await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, serializedTx)
    }, "Error: The proven value was expected to be")

  })

  it('Single transaction trie - proof of existence', async() => {
    const single_trie = await populateTree(singleTxBlock)

    const serializedTx = serialize.createTx(singleTxBlock.transactions[0]).serialize()
    const proof = await single_trie.getProof(rlp.encode(0))

    await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(0), proof, serializedTx)
  })

  it('Single transaction trie - proof of non-existence', async() => {
    const single_trie = await populateTree(singleTxBlock)

    const proof = await single_trie.getProof(rlp.encode(2))

    await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(2), proof, null)
  })

  it('Single transaction trie - incorrect proofs for existence will pass', async() => {
    const single_trie = await populateTree(singleTxBlock)
    const trie = await populateTree(block)

    const nonExistProof = await single_trie.getProof(rlp.encode(1))
    const serializedTx = serialize.serialize(serialize.toTransaction(singleTxBlock.transactions[0]))

    const maniProof = await single_trie.getProof(rlp.encode(0))
    const temp_proof = await trie.getProof(rlp.encode(64))
    maniProof[0] = temp_proof[temp_proof.length - 1]

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(0), maniProof, serializedTx)
    })

    return await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(0), nonExistProof, serializedTx)
  })

  it('Single transaction trie - incorrect proofs for non-existence will pass', async() => {
    const single_trie = await populateTree(singleTxBlock)
    const trie = await populateTree(block)

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

async function populateTree(block: BlockData): Promise<in3_trie>{
  const trie = new in3_trie()

  for(const tx of block.transactions){
    await trie.setValue(rlp.encode(tx.transactionIndex), serialize.serialize(serialize.toTransaction(tx)))
  }

  return trie
}
