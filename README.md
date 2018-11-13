# in3-trie
Implementation of the patricia merkle tree in typescript.
This also includes Merkle proofs.


## Usage

```js
import {serialize} from 'in3'
import Trie,{verifyProof} from 'in3-trie'

const encode = serialize.rlp.encode

// create a new Merkle Tree
const trie = new Trie()

// put all transactions of a block into the tree
for (let i=0;i<block.transactions.length;i++) 
  await trie.setValue(encode(i), encode(serialize.toTransaction(block.transactions[i])))

// verify the transactionRoot
if (trie.root.equals( Buffer.from(block.transactionsRoot.substr(2),'hex')))
   console.log('transaction verified')
else
   console.log('transaction not verified - wrong TransactionHash')

// create a merkle Proof for the first transaction
const path = encode(0)
const expectedValue = encode(serialize.toTransaction(block.transactions[0]))
const proof = await trie.getProof(path)

// verify this merkle proof and throw if it does not match
verifyProof(trie.root, path, proof, expectedValue)

```

Per default sha256 as hash and rlp-encoding is used to serilialize nodes, but you can configure your own hash and codec.
Also by configuring a db, you can also use the leveldb to work with.
