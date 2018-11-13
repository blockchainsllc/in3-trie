import { DB } from '.'

export default class MemoryDB implements DB {
  private data:Map<string,Buffer> 

  constructor() {
    this.data=new Map()
  }

  async getValue(key: Buffer) {
    const val = this.data.get(key.toString('hex'))
    return val ? Buffer.from(val) : undefined
  }  
  
  async setValue(key: Buffer, value: Buffer) {
  // console.log('DB '+key.toString('hex')+' = '+value.toString('hex'))
    if (!value)
       this.data.delete(key.toString('hex'))
    else
       this.data.set(key.toString('hex'),value)
  }


}