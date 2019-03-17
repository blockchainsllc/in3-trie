import { serialize, util, BlockData, ReceiptData, TransactionData} from 'in3'
import { keccak256, rlp, toBuffer } from 'ethereumjs-util'
import in3_trie from '../src/index'

const AssertionError = require('assertion-error')

interface NewBlockData extends BlockData {
  receipts: ReceiptData[]
}

interface TestCase {
  in: any,
  root: string,
  hexEncoded?: boolean
}

export async function assertThrowsAsynchronously(test, error?: string) {
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

export async function populateTree(testCase: TestCase): Promise<in3_trie>{
  const trie = new in3_trie()

  const inputs = testCase["in"]
  const secure = testCase["secure"]?true:false

  if(inputs[0]) {
    for(const pair of inputs){
      await trie.setValue(secure?keccak256(pair[0]):toBuffer(pair[0]), toBuffer(pair[1]))
    }
  }
  else {
    for(const key in inputs) {
      await trie.setValue(secure?keccak256(key):toBuffer(key), toBuffer(inputs[key]))
    }
  }
  return trie
}

export async function populateTransactionTree(block: BlockData): Promise<in3_trie>{
  const trie = new in3_trie()

  for(const tx of block.transactions){
    await trie.setValue(rlp.encode(tx.transactionIndex), serialize.serialize(serialize.toTransaction(tx)))
  }

  return trie
}

export async function populateReceiptTree(block: NewBlockData): Promise<in3_trie>{

  const trie = new in3_trie()

  for(const r of block.receipts){
    if(typeof r.status != "string") r.status = r.status?"0x1":"0x0"
    if(typeof r.cumulativeGasUsed != "string") r.cumulativeGasUsed = util.toHex(r.cumulativeGasUsed)

    await trie.setValue(rlp.encode(r.transactionIndex), serialize.serialize(serialize.toReceipt(r)))
  }

  return trie
}

export function serializeTransactions(tx: TransactionData): Buffer {
  return serialize.serialize(serialize.toTransaction(tx))
}

export function serializeReceipts(tx: ReceiptData): Buffer {
  return serialize.serialize(serialize.toReceipt(tx))
}
