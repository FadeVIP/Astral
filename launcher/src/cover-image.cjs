'use strict';
const fs=require('node:fs/promises');
async function prepareCover(file,nativeImage) {
  const stat=await fs.stat(file);
  if(!stat.isFile() || stat.size>10*1024**2)throw Error('Выберите изображение PNG, JPG или WebP размером до 10 МБ.');
  const bytes=await fs.readFile(file);
  const supported=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) || (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP');
  if(!supported)throw Error('Нужен файл PNG, JPG или WebP.');
  const image=nativeImage.createFromBuffer(bytes);
  if(image.isEmpty())throw Error('Не удалось прочитать изображение. Выберите другой файл.');
  const {width,height}=image.getSize();
  if(width<32 || height<32 || width*height>40000000)throw Error('Размер изображения: от 32 пикселей по каждой стороне, не более 40 мегапикселей.');
  for(const maximum of [1280,960,640]) {
    const scale=Math.min(1,maximum/width,720/height);
    const resized=image.resize({width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),quality:'best'});
    for(const quality of [82,68,50]) {
      const data='data:image/jpeg;base64,'+resized.toJPEG(quality).toString('base64');
      if(data.length<=180000)return {image:data,width:resized.getSize().width,height:resized.getSize().height};
    }
  }
  throw Error('Не удалось уменьшить изображение. Выберите файл попроще.');
}
module.exports={prepareCover};
