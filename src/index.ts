import MemoryDB from './memdb'
import {rlp, keccak, toBuffer} from 'ethereumjs-util'
import verify,{ createVerifier  } from './proof'

const EMPTY = Buffer.allocUnsafe(0)

export interface DB {
  getValue(key:Buffer):Promise<Buffer>
  setValue(key:Buffer, value:Buffer):Promise<void>
}

export type Hash = Buffer
export type NodeKey = Hash | Buffer[]
export type Hasher = (data:Buffer)=>Buffer
export interface Codec {
  encode(data:Buffer[]):Buffer
  decode(data:Buffer):Buffer[]
}

export type Nibbles = number[]
export enum NodeType {
  Branch,
  Extension,
  Leaf,
  Empty
}

export default class Trie {
  private db:DB
  private hasher:Hasher
  private codec:Codec
  public root:Hash

  constructor(root?:Buffer, config?: { hasher:Hasher, codec:Codec, db:DB } ) {
    this.db = config && config.db || new MemoryDB()
    this.hasher = config && config.hasher || keccak
    this.codec = config && config.codec || rlp
    this.root = root || this.hasher(this.codec.encode(EMPTY as any))
  }

  /**
   * sets a value in the db.
   * @param key sets a value in
   * @param value the value to set
   */
  public async setValue( key:Buffer, value:Buffer ):Promise<NodeKey> {
    if (!key || !key.length) throw new Error('Key cannot be empty!');
    [key,value] = [key,value].map(toBuffer)

    const handleNode = async ( curNode: TrieNode, path:Nibbles )=> {
      if (!curNode)
         return  await this.updateDB(TrieNode.createLeaf(path,value), path.length==key.length*2)

      if (path.length==0) {
        switch (curNode.type) {
          case NodeType.Branch:
          case NodeType.Leaf:
            const nodePath = curNode.path
            // here we simply change the value if the path ends here
            if (nodePath.length===0)
               curNode.data[curNode.data.length-1]=value
            else {
              // so this is a leaf with a longer path and we try to set a value with a here
              // so we create a branch and set the leaf
              curNode.path = nodePath.slice(1)
              const b = TrieNode.createBranch()
              b.data[16] = value
              b.data[nodePath[0]] = await this.updateDB(curNode) as Buffer
              curNode = b
            }
            break
          case NodeType.Extension:
            // insert a branch with the current value
            const branch = TrieNode.createBranch()
            branch.data[16] = value
            const relPath = curNode.path
            if (relPath.length===1) {
              // the extension has no elements to skip left, we remove it and replace it with the branch.
              branch.data[relPath[0]]=curNode.target
            }
            else {
              // we remove the first nibble in the path with the branch
              curNode.path = relPath.slice(1)
              // update the hash here, since we return the hash of the branch
              branch.data[relPath[0]] = await this.updateDB(curNode) as Buffer
            }
            curNode = branch
            break
        }
      }
      else {
        switch (curNode.type) {
          case NodeType.Branch:
            const first = path[0]
            if (curNode.data[first] == EMPTY)
              // we can simply add a leaf here
              curNode.data[first] = await this.updateDB(TrieNode.createLeaf(path.slice(1),value)) as Buffer
            else
              // handle the next node
              curNode.data[first] = await handleNode(await this.getNode(curNode.data[first]),path.slice(1)) as Buffer
            break
          case NodeType.Extension:
          case NodeType.Leaf:
            const nextPath = curNode.path
            const matching = matchingNibbles( path ,nextPath)

            if (matching === path.length && curNode.type === NodeType.Leaf && matching === nextPath.length) // next element fits so we can update next node
                // for Leaf: we simply replace the leaf-value
                curNode.data[1] = value
            else if(matching === nextPath.length && curNode.type===NodeType.Extension)
                // for Extension: we follow the path
                curNode.data[1] = await handleNode(await this.getNode(curNode.data[1]),path.slice(nextPath.length)) as Buffer
            else { // does not fit, so we need rebuild the trie
              // create the branch
              const branch = TrieNode.createBranch()
              curNode.path = nextPath.slice(matching+1)
              const restPath = path.slice(matching)

              if(nextPath.length === matching || nextPath.length === 0)
                branch.data[16] = curNode.value

              if (restPath.length===0 && nextPath.length != 0)
                branch.data[16]=value
              else
                branch.data[restPath[0]] = await this.updateDB(TrieNode.createLeaf(restPath.slice(1),value)) as Buffer
              branch.data[nextPath[matching]] = nextPath.length===matching+1 && curNode.type == NodeType.Extension ? curNode.target : await this.updateDB(curNode) as Buffer

              // use the new current node
              curNode = matching>0 ? TrieNode.createExt(nextPath.slice(0,matching), await this.updateDB(branch)) : branch
            }
        }
      }

      // store the changed node in the db and return the hash (or node.data if rawValue is less than 32byte)
      return this.updateDB(curNode, path.length==key.length*2)
    }

     return this.root = await handleNode( await this.getNode(this.root), toNibbles(key)) as Buffer
  }

  /**
   * returns the value for the given key or path
   * @param key the key or path
   * @param proof if a empty array is passed, it will be filled with the encoded data of the nodes (a merkle Proof)
   * @returns the result as Buffer or undefined
   */
  async getValue(key:Buffer, proof?:Buffer[]):Promise<Buffer> {
    key = toBuffer(key)
    const handleNode = async ( curNode: TrieNode, path:Nibbles )=> {
      debugger
      if (proof && !curNode.isEmbedded) proof.push(this.codec.encode(curNode.data))
      switch (curNode.type) {
        case NodeType.Branch:
          if (path.length===0) return curNode.data[16]
          if (!curNode.data[path[0]] || !curNode.data[path[0]].length) return undefined
          return await handleNode( await this.getNode(curNode.data[path[0]]),path.slice(1))

        case NodeType.Extension:
        case NodeType.Leaf:
           const nextPath = curNode.path
           if ( matchingNibbles(nextPath, path)<nextPath.length )
              return undefined
           if ( curNode.type === NodeType.Leaf) return curNode.value
           return await handleNode( await this.getNode(curNode.target),path.slice(nextPath.length))
      }
    }
    debugger
    return handleNode( await this.getNode(this.root), toNibbles(key))
  }

  /**
   * creates a new Trie instance working with the same database, but a different Root
   * @param hash the new Root-Hash
   */
  public forRoot(hash:Hash):Trie {
    return new Trie(hash,{ hasher:this.hasher, codec:this.codec, db:this.db})
  }

  /**
   * creates a MerkleProof for the given value.
   * @param key
   */
  public async getProof(key:Buffer):Promise<Buffer[]> {
    const proof=[]
    return this.getValue(key,proof).then(_=>proof)
  }

  /**
   * returns a graphical representation of the complete Trie
   * @param withHash if true the hashes of the nodes are included
   */
  public async dump(withHash=false) {
    const white = (l:number)=> {
      let s=''
      while (s.length<l) s+=' '
      return s
    }
    const handle = async (node:TrieNode, prefix:string) => {
      if (!node || !node.data.length) return '<null!!>'
      let r = withHash ? '<'+ this.hasher( this.codec.encode(node.data) ).toString('hex').substr(0,6)+'>' : ''
      switch (node.type) {
        case NodeType.Branch:
          r+='<B> '
          if (!node.value.equals(EMPTY)) r+=' = 0x'+node.value.toString('hex')
          const lastIndex =  node.data.reduce((p,n,i)=>i>15 || !n.length ? p : i,-1)

          for (let i=0;i<16;i++)
            if (node.data[i].length) {
              r+='\n'+prefix+' +- '+hex.charAt(i)+': '+( await handle( await this.getNode(node.data[i]) ,prefix+(i<lastIndex?' |':'  ')+'     '))
            }
          return r
        case NodeType.Extension:
          r += '<EXT '+node.path.map(_=>_.toString(16)).join(' ') + '> => '
          return r + ( await handle( await this.getNode(node.target) ,prefix+white(r.length) ))
        case NodeType.Leaf:
          return r+ '<LEAF '+node.path.map(_=>_.toString(16)).join(' ') + '> = 0x' +node.value.toString('hex')
      }
    }

    return handle(await this.getNode(this.root),'')
  }


  /**
   * returns the node for a hash (or in case of the decoded datat this will be used directly)
   * @param hash the hasb or decoded Buffer[] array
   */
  private async getNode(hash:NodeKey):Promise<TrieNode> {
    if (!Buffer.isBuffer(hash)) return new TrieNode(hash as any,true)
    const data = await this.db.getValue(hash)
    return data ? new TrieNode(this.codec.decode(data)) : null
  }

  /**
   * stores the node in the DB (or if the rawData is smaller than 32 bytes returnes the data to be embedded)
   * @param node the node
   * @param isTopLevel if topLevel, then it will always return the hash
   */
  private async updateDB( node:TrieNode, isTopLevel=false):Promise<NodeKey> {
    const rawData = this.codec.encode(node.data)
    if (rawData.length<32 && !isTopLevel)
      return node.data
    const hash = this.hasher(rawData)
    return this.db.setValue(hash,rawData).then(()=>hash)
  }

}


/**
 * creates 4bit nibbles from a path
 * @param path the path
 * @param usePrefix if prefix is used to the first 4 bit will indicate if it is odd or even.
 */
export function toNibbles(path:Buffer, usePrefix=false):Nibbles {
  const res:Nibbles = new Array(path.length*2)
  path.forEach((val,i)=>{
    res[i*2]=val >> 4
    res[i*2+1]=val & 15
  })

  if (usePrefix)
    res.splice(0,2-(res[0] & 1) )
  return res
}

/**
 * returns the number of nibbles matching starting at the beginning.
 * @param a
 * @param b
 */
export function matchingNibbles(a:Nibbles, b:Nibbles) {
  const maxLen = Math.min(a.length,b.length)
  for (let i=0;i<maxLen;i++) {
     if (a[i]!==b[i]) return i
  }
  return maxLen
}

export const verifyProof = verify
export const createProofVerifier = createVerifier

const hex = '0123456789abcdef'

/**
 * a Node in a Trie
 */
export class TrieNode {
  public data:Buffer[]
  public isEmbedded:boolean
  constructor(data:Buffer[],isEmbedded=false) {
    this.isEmbedded=isEmbedded
    this.data = data
  }

  /**
   * creates a empty Branch
   */
  static createBranch() {
    return new TrieNode([EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY,EMPTY])
  }

  /**
   * creates a Node from the raw data
   * @param data
   * @param codec
   */
  static fromRaw(data:Buffer, codec:Codec):TrieNode {
    return new TrieNode(codec.decode(data))
  }



  /**
   * creates a Leaf-Node
   * @param path
   * @param value
   */
  static createLeaf(path:Nibbles, value:Buffer) {
    const node = new TrieNode([Buffer.from('20','hex'),value])
    node.path=path
    return node
  }

  /**
   * creates a Extension-Node
   * @param path the relPath
   * @param value the hash of the next node or the data
   */
  static createExt(path:Nibbles, value:Hash| Buffer[]) {
    const node = new TrieNode([Buffer.from('00','hex'),value as any])
    node.path=path
    return node
  }

  /**
   * return the type of the node
   */
  get type() {
    if (this.data.length==17)
      return NodeType.Branch
    else if (!this.data || !this.data.length)
      return NodeType.Empty
    if (this.data.length!==2) throw new Error('Invalid Node Type (length='+this.data.length)
    return this.data[0][0] & 32 ? NodeType.Leaf : NodeType.Extension
  }

  /**
   * returns the value (or undefined in case of a extension)
   */
  get value() {
    return this.type === NodeType.Extension ? undefined : this.data[this.data.length-1]
  }

  /**
   * the target or nextNode (only for extension)
   */
  get target() {
    return this.type === NodeType.Extension ? this.data[1] : undefined
  }

  /**
   * the relative path
   */
  get path() {
    return this.type === NodeType.Branch ? [] as Nibbles : toNibbles(this.data[0],true)
  }

  set path(val:Nibbles) {
    if (this.type === NodeType.Branch) return
    const odd = val.length % 2
    const n = [(this.type === NodeType.Extension ? 0 : 2) + odd]
    if (!odd) n.push(0)
    this.data[0] = Buffer.from([...n,...val].map(_=>hex.charAt(_)).join(''),'hex')
  }

}
