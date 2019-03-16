import {assert} from 'chai'
const AssertionError = require('assertion-error')
import 'mocha'
import * as fs from 'fs'
import in3_trie from '../src/index'
import {rlp, keccak, toBuffer, setLengthLeft, bufferToInt} from 'ethereumjs-util'
import { serialize, util } from 'in3'
import verifyMerkleProof from '../src/proof'

const toHex = util.toHex

describe('Transaction Trie Tests', async () => {

  const trie = new in3_trie()
  const single_trie = new in3_trie()

  const block = JSON.parse(fs.readFileSync('./test/block.json', 'utf8').toString())
  const singleTxBlock = JSON.parse(fs.readFileSync('./test/singleTxBlock.json', 'utf8').toString())

  it('Construct a merkle tree', async() => {
    for(const tx of block.transactions){
      await trie.setValue(rlp.encode(tx.transactionIndex), serialize.createTx(tx).serialize())
    }

    assert.equal(block.transactionsRoot,'0x' + trie.root.toString('hex'))

    for(const tx of singleTxBlock.transactions){
      await single_trie.setValue(rlp.encode(tx.transactionIndex), serialize.createTx(tx).serialize())
    }

    assert.equal(singleTxBlock.transactionsRoot,'0x' + single_trie.root.toString('hex'))
  })

  it('Proof of transaction existence', async () => {
    const txIndex = randomIndex(0, block.transactions.length)
    const serializedTx = serialize.createTx(block.transactions[txIndex]).serialize()
    const proof = await trie.getProof(rlp.encode(txIndex))

    await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, serializedTx)
  })

  it('Incorrect proof of transaction existence', async () => {
    const txIndex = randomIndex(0, block.transactions.length)
    const serializedTx = serialize.createTx(block.transactions[txIndex]).serialize()

    //index+1 because youare generating a incorrect proof or proof for the next transaction and not the current one
    const proof = await trie.getProof(rlp.encode(randomIndex(txIndex + 1, block.transactions.length*20)))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex),proof, serializedTx)
    }, "Error: Bad proof node")
  })

  it('Wrong expected value against proof of transaction existence', async () => {
    const txIndex = 0
    const serializedTx = serialize.createTx(block.transactions[1]).serialize()
    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async() => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, serializedTx)
    }, "Error: The proven value was expected to be")
  })

  it('Proof of transaction non-existence', async () => {
    //txIndex is out of bounds
    const txIndex = randomIndex(block.transactions.length, block.transactions.length*2)
    const proof = await trie.getProof(rlp.encode(txIndex))

    await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, null)
  })

  it('Incorrect proof of transaction non-existence using in bounds index', async () => {
    //txIndex is out of bounds
    const txIndex = randomIndex(block.transactions.length, block.transactions.length*2)


    const proof = await trie.getProof(rlp.encode(txIndex - block.transactions.length))

    await assertThrowsAsynchronously( async () => {
      return await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, null)
    }, "Error: Bad proof node")
  })

  it('Wrong expected value against proof of transaction non-existence', async () => {
    //txIndex is out of bounds
    const txIndex = block.transactions.length + 10
    const serializedTx = serialize.createTx(block.transactions[0]).serialize()

    const proof = await trie.getProof(rlp.encode(txIndex))

    await assertThrowsAsynchronously( async () => {
      await verifyMerkleProof(toBuffer(block.transactionsRoot), rlp.encode(txIndex), proof, serializedTx)
    }, "Error: The proven value was expected to be")
  })

  it('Single transaction trie - proof of existence', async() => {
    const serializedTx = serialize.createTx(singleTxBlock.transactions[0]).serialize()
    const proof = await single_trie.getProof(rlp.encode(0))

    await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(0), proof, serializedTx)
  })

  it('Single transaction trie - proof of non-existence', async() => {
    const proof = await single_trie.getProof(rlp.encode(2))

    await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(2), proof, null)
  })

  it('Single transaction trie - incorrect proofs for existence will pass', async() => {
    const proof = await single_trie.getProof(rlp.encode(1))
    const serializedTx = serialize.createTx(singleTxBlock.transactions[0]).serialize()

    return await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(0), proof, serializedTx)
  })

  it('Single transaction trie - incorrect proofs for non-existence will pass', async() => {
    const proof = await single_trie.getProof(rlp.encode(0))

    await verifyMerkleProof(toBuffer(singleTxBlock.transactionsRoot), rlp.encode(1), proof, null)
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
