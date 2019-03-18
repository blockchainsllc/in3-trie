/***********************************************************
* This file is part of the Slock.it IoT Layer.             *
* The Slock.it IoT Layer contains:                         *
*   - USN (Universal Sharing Network)                      *
*   - INCUBED (Trustless INcentivized remote Node Network) *
************************************************************
* Copyright (C) 2016 - 2018 Slock.it GmbH                  *
* All Rights Reserved.                                     *
************************************************************
* You may use, distribute and modify this code under the   *
* terms of the license contract you have concluded with    *
* Slock.it GmbH.                                           *
* For information about liability, maintenance etc. also   *
* refer to the contract concluded with Slock.it GmbH.      *
************************************************************
* For more information, please refer to https://slock.it   *
* For questions, please contact info@slock.it              *
***********************************************************/

import { matchingNibbles, NodeType, toNibbles, Codec, Hasher, TrieNode, Nibbles } from '.';
import {rlp, keccak, toBuffer} from 'ethereumjs-util'


export function createVerifier(config?:{codec:Codec, hasher:Hasher}, errorMsg?: string) {
  return (rootHash: Buffer, path: Buffer, proof: Buffer[], expectedValue: Buffer)=> verify(rootHash,path,proof,expectedValue,config,errorMsg)
}

/**
 * Verifies a Merkle Proof.
 * @param rootHash the rootHash of the Trie
 * @param path the path to proof
 * @param proof the serialized nodes
 * @param expectedValue expected value, if null, this function verifies for non existing node.
 * @param errorMsg the error message that should be used in case of not verifiable.
 *
 * The function will return the value of the last node if it was successfull or throw otherwise.
 */
export default function verify(rootHash: Buffer, path: Buffer, proof: Buffer[], expectedValue: Buffer, conf?:{codec:Codec, hasher:Hasher}, errorMsg?: string) {

  // use defaults
  const config = {codec:rlp, hasher:keccak, ...conf}

  // prepare Error-Message
  const errorPrefix = errorMsg ? errorMsg + ' : ' : ''

  // create the nibbles to iterate over the path
  const key = toNibbles(path)

  // start with the root-Hash
  let wantedHash = rootHash
  let lastNode: TrieNode = null

  // iterate through the nodes starting at root
  for (let i = 0; i < proof.length; i++) {
    const p = proof[i]
    const hash = config.hasher(p)

    // verify the hash of the node
    if (Buffer.compare(hash, wantedHash))
      throw new Error('Bad proof node ' + i + ': hash mismatch');

    // create the node
    [lastNode, wantedHash] = checkNode(TrieNode.fromRaw(p, config.codec),key, expectedValue,errorPrefix,i===proof.length-1)
  }

  debugger

  // if we don't expect a value
  if (expectedValue === null)
    return null
  else if (expectedValue === undefined)
    return lastNode.value
  else if (lastNode && lastNode.value && lastNode.value.equals(expectedValue))
    return lastNode.value

  // if we expected this to be null and there is not further node since wantedHash is empty or we had a extension as last element, than it is ok not to find leafs
  else if (expectedValue && (!lastNode || !lastNode.value || expectedValue.compare(lastNode.value)))
    throw new Error(errorPrefix + 'The proven value was expected to be ' + expectedValue.toString('hex') + ' but is ' + (lastNode && lastNode.value && lastNode.value.toString('hex')))

  // we reached the end of the proof, but not of the path
  throw new Error('Unexpected end of proof')
}



function checkNode(node:TrieNode, key:Nibbles, expectedValue:Buffer, errorPrefix:string, isLastNode:boolean):[TrieNode,Buffer] {
  switch (node.type) {
    case NodeType.Empty:
       // only if we expect no value we accept a empty node as last node
      if (expectedValue === null && isLastNode)
        return [node,null]
      throw new Error('invalid empty node here')
    case NodeType.Branch:
      // we reached the end of the path
      if (key.length === 0) {
        if (!isLastNode || Array.isArray(node.value))
          throw new Error(errorPrefix + 'Additional nodes at end of proof (branch)')

        // this is the last node
        return [node,null]
      }

      // find the childHash
      const childHash = node.data[key[0]]

      // remove the first item
      key.splice(0, 1)

      if ( Array.isArray(childHash))
        return checkNode(new TrieNode(childHash as any),key,expectedValue,errorPrefix,isLastNode)
      else
        return [node, childHash]

    case NodeType.Leaf:
    case NodeType.Extension:
      const val = node.value
      const nodePath = node.path

      // if the relativeKey in the leaf does not math our rest key, we throw!
      if (matchingNibbles(nodePath, key) !== nodePath.length) {
        // so we have a wrong leaf here, if we actually expected this node to not exist,
        // the last node in this path may be a different leaf or a branch with a empty hash
        if (expectedValue === null && isLastNode)
          return [node, null]

        throw new Error(errorPrefix + 'Key does not match with the proof one (extention|leaf)')
      }

      // remove the items from path
      key.splice(0, nodePath.length)

      // do we have an embedded node?
      if (Array.isArray(val))
         return checkNode(new TrieNode(val as any),key,expectedValue,errorPrefix,isLastNode)
      else if (key.length===0) {
        if (!isLastNode)
          throw new Error(errorPrefix + 'Additional nodes at end of proof (extention|leaf)')

        // if we are proven a value which shouldn't exist this must throw an error
        if (expectedValue === null && node.type===NodeType.Leaf)
          throw new Error(errorPrefix + 'The value shouldn\'t exist, but is ' + val.toString('hex'))

      }
      else if (node.type===NodeType.Leaf && expectedValue!==null)
        throw new Error(errorPrefix + 'Leaf value should not exist here!')
      return [node, node.target]
  }
}
