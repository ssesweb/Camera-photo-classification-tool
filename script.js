// 辅助函数：格式化字节大小
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 全局变量
let allFiles = [];
let selectedFiles = new Set();
let cropper = null;

// 缓存机制
function cacheFiles() {
    const fileData = allFiles.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
    }));
    localStorage.setItem('cachedFiles', JSON.stringify(fileData));
    localStorage.setItem('cachedSelectedFiles', JSON.stringify(Array.from(selectedFiles)));
}

function loadCachedFiles() {
    const cachedFilesData = localStorage.getItem('cachedFiles');
    const cachedSelectedFilesData = localStorage.getItem('cachedSelectedFiles');

    if (cachedFilesData) {
        const fileData = JSON.parse(cachedFilesData);
        // 注意：File对象不能直接从JSON恢复，这里只是恢复文件信息
        // 实际的文件内容需要用户重新拖入或选择
        allFiles = fileData.map(data => new File([], data.name, { type: data.type, lastModified: data.lastModified }));
    }

    if (cachedSelectedFilesData) {
        selectedFiles = new Set(JSON.parse(cachedSelectedFilesData));
    }
    updateFileStats();
    renderPreview();
    updateButtonStates();
}

function clearCache() {
    localStorage.removeItem('cachedFiles');
    localStorage.removeItem('cachedSelectedFiles');
}
// DOM元素
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const previewGrid = document.getElementById('previewGrid');
const fileCountEl = document.getElementById('fileCount');
const jpgCountEl = document.getElementById('jpgCount');
const rawCountEl = document.getElementById('rawCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const downloadJpgBtn = document.getElementById('downloadJpgBtn');
const downloadRawBtn = document.getElementById('downloadRawBtn');
const modal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImage');
const modalCaption = document.getElementById('modalCaption');
const closeModal = document.getElementsByClassName('close')[0];
const clearAllBtn = document.getElementById('clearAllBtn');

// 新增DOM元素
const viewModeSelect = document.getElementById('viewModeSelect');
const previewSizeSlider = document.getElementById('previewSizeSlider');
const previewSizeValue = document.getElementById('previewSizeValue');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const sizePresetBtns = document.querySelectorAll('.size-preset');

// 预览设置
let previewSettings = {
    mode: 'adaptive',  // adaptive
    size: 200,     // 预览图片大小（像素）
    zoomLevel: 1   // 模态框缩放级别
};

function initEventListeners() {
    // 全选/取消全选按钮
    document.getElementById('selectAllBtn').addEventListener('click', selectAll);
    document.getElementById('deselectAllBtn').addEventListener('click', deselectAll);

    // 下载按钮
    downloadJpgBtn.addEventListener('click', () => downloadZip('jpg'));
    downloadRawBtn.addEventListener('click', () => downloadZip('raw'));

    // 清空按钮
    document.getElementById('clearAllBtn').addEventListener('click', clearAll);

    // 裁剪按钮
    document.getElementById('cropBtn').addEventListener('click', toggleCrop);

    // 模态框关闭按钮
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
        if (cropper) {
            cropper.destroy();
            cropper = null;
            document.getElementById('cropBtn').textContent = '裁剪';
            // 重新启用按钮
            document.getElementById('zoomInBtn').disabled = false;
            document.getElementById('zoomOutBtn').disabled = false;
            document.getElementById('resetZoomBtn').disabled = false;
        }
    });

    // 搜索框
    const searchBox = document.createElement('input');
    searchBox.placeholder = '输入文件名关键词筛选';
    searchBox.id = 'searchBox'; // 添加ID方便引用
    document.querySelector('.preview-header').appendChild(searchBox);

    // 新增筛选函数
    function filterFilesByName(keyword) {
        document.querySelectorAll('.preview-item').forEach(item => {
            const filenameDiv = item.querySelector('.filename');
            if (filenameDiv) {
                const match = filenameDiv.textContent.toLowerCase().includes(keyword.toLowerCase());
                item.style.display = match ? 'block' : 'none';
            }
        });
    }

    searchBox.addEventListener('input', (e) => {
        filterFilesByName(e.target.value);
    });

    // 预览模式选择
    viewModeSelect.addEventListener('change', updatePreviewMode);

    // 预览大小滑块
    previewSizeSlider.addEventListener('input', updatePreviewSize);

    // 预设大小按钮
    sizePresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            previewSizeSlider.value = btn.dataset.size;
            updatePreviewSize();
        });
    });

    // 缩放按钮
    zoomInBtn.addEventListener('click', () => zoomImage(1.2));
    zoomOutBtn.addEventListener('click', () => zoomImage(0.8));
    resetZoomBtn.addEventListener('click', resetZoom);

    // 拖拽事件监听器
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false); // 防止拖拽到页面其他地方
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    dropArea.addEventListener('drop', handleDrop, false);

    // 文件输入改变事件
    fileInput.addEventListener('change', handleFiles, false);
}

// 阻止默认行为
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// 高亮拖拽区域
function highlight() {
    dropArea.classList.add('highlight');
}

// 取消高亮拖拽区域
function unhighlight() {
    dropArea.classList.remove('highlight');
}

// 处理拖拽文件
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles({ target: { files } });
}

// 处理文件
function handleFiles(e) {
    try {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;
        
        // 转换FileList为数组并添加到全局文件列表
        const newFiles = Array.from(fileList).filter(file => {
            // 只接受JPG和RAW文件
            const ext = getFileExtension(file.name).toLowerCase();
            return isJpgFile(ext) || isRawFile(ext);
        });
        
        if (newFiles.length === 0) {
            alert('请上传JPG或RAW格式的文件');
            return;
        }
        
        // 添加到全局文件列表
        allFiles = [...allFiles, ...newFiles];
        
        // 默认选中所有文件
        newFiles.forEach(file => selectedFiles.add(file.name));
        
        // 更新UI
        updateFileStats();
        renderPreview();
        updateButtonStates();
        cacheFiles(); // 缓存文件状态
        
        // 重置文件输入，允许重复上传相同文件
        e.target.value = '';
    } catch (error) {
        console.error('文件上传错误:', error);
        alert('文件上传失败: ' + error.message);
    }
}

// 获取文件扩展名
function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
}

// 判断是否为JPG文件
function isJpgFile(ext) {
    return ['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase());
}

// 判断是否为RAW文件
function isRawFile(ext) {
    return ['raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2'].includes(ext.toLowerCase());
}

// 获取不带扩展名的文件名
function getBaseFilename(filename) {
    return filename.substring(0, filename.lastIndexOf('.'));
}

// 新增函数：尝试从文件名中提取日期
function getDateFromFilename(filename) {
    const match = filename.match(/(\d{4})(\d{2})(\d{2})/); // 匹配 YYYYMMDD 格式
    if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }
    return new Date().toISOString().slice(0, 10); // 默认返回当前日期
}

// 更新文件统计信息
function updateFileStats() {
    const jpgFiles = allFiles.filter(file => isJpgFile(getFileExtension(file.name)));
    const rawFiles = allFiles.filter(file => isRawFile(getFileExtension(file.name)));
    
    fileCountEl.textContent = allFiles.length;
    jpgCountEl.textContent = jpgFiles.length;
    rawCountEl.textContent = rawFiles.length;

    // 计算文件总大小
    const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);
    const jpgSize = jpgFiles.reduce((sum, file) => sum + file.size, 0);
    const rawSize = rawFiles.reduce((sum, file) => sum + file.size, 0);

    document.getElementById('totalSize').textContent = `总大小: ${formatBytes(totalSize)}`;
    document.getElementById('jpgSize').textContent = `JPG大小: ${formatBytes(jpgSize)}`;
    document.getElementById('rawSize').textContent = `RAW大小: ${formatBytes(rawSize)}`;
}

// 渲染预览
function renderPreview() {
    // 清空预览区域
    previewGrid.innerHTML = '';
    
    // 对文件进行分组
    const fileGroups = groupFiles(allFiles);
    
    // 渲染每个文件
    fileGroups.forEach(group => {
        // 找出组中的JPG文件用于预览
        const previewFile = group.find(file => isJpgFile(getFileExtension(file.name))) || group[0];
        
        // 创建预览项
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        
        // 根据当前预览模式和大小设置样式
        if (previewSettings.mode === 'adaptive') {
            // 自适应模式下，宽度会根据内容自动调整
            previewItem.style.maxWidth = `${previewSettings.size * 1.5}px`;
        }
        
        // 如果是成对的文件，添加指示器
        if (group.length > 1) {
            const pairIndicator = document.createElement('div');
            pairIndicator.className = 'pair-indicator';
            pairIndicator.textContent = '成对';
            previewItem.appendChild(pairIndicator);
        }
        
        // 添加复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox';
        checkbox.checked = group.some(file => selectedFiles.has(file.name));
        checkbox.addEventListener('change', () => {
            group.forEach(file => {
                if (checkbox.checked) {
                    selectedFiles.add(file.name);
                } else {
                    selectedFiles.delete(file.name);
                }
            });
            updateButtonStates();
        });
        previewItem.appendChild(checkbox);
        
        // 创建预览图
        if (isJpgFile(getFileExtension(previewFile.name))) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(previewFile);
            
            // 根据预览模式设置图片样式
            if (previewSettings.mode === 'adaptive') {
                img.style.maxHeight = `${previewSettings.size}px`;
                img.style.maxWidth = '100%';
                img.style.objectFit = 'contain';
            }
            
            img.addEventListener('click', () => showModal(previewFile));
            previewItem.appendChild(img);
        } else {
            // 对于RAW文件，显示占位图
            const placeholder = document.createElement('div');
            placeholder.className = 'raw-placeholder';
            placeholder.textContent = 'RAW';
            
            // 根据预览模式设置占位图样式
            if (previewSettings.mode === 'adaptive') {
                placeholder.style.height = `${previewSettings.size}px`;
                placeholder.style.minWidth = `${previewSettings.size}px`;
            }
            
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.backgroundColor = '#f1f1f1';
            placeholder.style.color = '#666';
            placeholder.style.fontSize = '24px';
            previewItem.appendChild(placeholder);
        }
        
        // 添加文件信息
        const info = document.createElement('div');
        info.className = 'info';
        
        const filename = document.createElement('div');
        filename.className = 'filename';
        filename.textContent = previewFile.name;
        info.appendChild(filename);
        
        const type = document.createElement('div');
        type.className = 'type';
        type.textContent = isJpgFile(getFileExtension(previewFile.name)) ? 'JPG' : 'RAW';
        info.appendChild(type);
        
        previewItem.appendChild(info);
        previewGrid.appendChild(previewItem);
    });
}

// 显示模态框
function showModal(file) {
    modalImg.src = URL.createObjectURL(file);
    modalCaption.textContent = file.name;
    modal.style.display = "block";
    
    // 销毁之前的裁剪器实例
    if (cropper) {
        cropper.destroy();
    }
    
    // 重置缩放
    resetZoom();
}

// 全选
function selectAll() {
    allFiles.forEach(file => selectedFiles.add(file.name));
    renderPreview();
    updateButtonStates();
}

// 取消全选
function deselectAll() {
    selectedFiles.clear();
    renderPreview();
    updateButtonStates();
}

// 更新按钮状态
function updateButtonStates() {
    const hasSelectedJpg = allFiles.some(file => 
        selectedFiles.has(file.name) && isJpgFile(getFileExtension(file.name)));
    
    const hasSelectedRaw = allFiles.some(file => 
        selectedFiles.has(file.name) && isRawFile(getFileExtension(file.name)));
    
    downloadJpgBtn.disabled = !hasSelectedJpg;
    downloadRawBtn.disabled = !hasSelectedRaw;
}

// 下载ZIP
async function downloadZip(type) {
    const isTypeMatch = type === 'jpg' ? isJpgFile : isRawFile;
    
    // 获取DOM元素
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');


    // 获取要处理的文件
    const filesToProcess = allFiles
        .filter(file => selectedFiles.has(file.name) && isTypeMatch(getFileExtension(file.name)));
    
    if (filesToProcess.length === 0) {
        alert(`没有选中的${type.toUpperCase()}文件可下载`);
        return;
    }

    const totalDownloadSize = filesToProcess.reduce((sum, file) => sum + file.size, 0);
    const ONE_GB = 1024 * 1024 * 1024; // 1 GB
    const MAX_CHUNK_SIZE = 900 * 1024 * 1024; // 900 MB

    if (totalDownloadSize > ONE_GB) {
        const confirmSplit = confirm(
            `下载文件总大小约为 ${formatBytes(totalDownloadSize)}，超过1GB。\n是否拆分为多个不超过900MB的压缩包进行下载？`
        );
        if (!confirmSplit) {
            return; // 用户取消下载
        }

        // 拆分文件并分批下载
        let currentChunkSize = 0;
        let currentChunkFiles = [];
        let chunkIndex = 1;

        for (const file of filesToProcess) {
            if (currentChunkSize + file.size > MAX_CHUNK_SIZE && currentChunkFiles.length > 0) {
                await generateAndDownloadZip(currentChunkFiles, type, chunkIndex, totalDownloadSize, progressContainer, progressBar, progressText, progressPercent);
                chunkIndex++;
                currentChunkSize = 0;
                currentChunkFiles = [];
            }
            currentChunkFiles.push(file);
            currentChunkSize += file.size;
        }

        // 下载最后一个分块
        if (currentChunkFiles.length > 0) {
            await generateAndDownloadZip(currentChunkFiles, type, chunkIndex, totalDownloadSize, progressContainer, progressBar, progressText, progressPercent);
        }

        return; // 完成分批下载
    }

    // 如果总大小不超过1GB，则直接下载一个ZIP包
    await generateAndDownloadZip(filesToProcess, type, null, totalDownloadSize, progressContainer, progressBar, progressText, progressPercent);
}

// 辅助函数：生成并下载ZIP文件
async function generateAndDownloadZip(filesToProcess, type, chunkIndex, totalDownloadSize, progressContainer, progressBar, progressText, progressPercent) {
    const zip = new JSZip();
    
    // 显示进度条
    showProgressBar('准备下载...');

    
    // 计算总文件大小，用于更准确的进度计算
    const totalSize = filesToProcess.reduce((sum, file) => sum + file.size, 0);
    let processedSize = 0;
    
    // 根据文件类型调整进度分配
    // RAW文件通常较大，给文件读取阶段分配更多进度比例
    const readingPhasePercent = type === 'raw' ? 80 : 60;
    const zipPhasePercent = 100 - readingPhasePercent;
    
    // 添加选中的文件到ZIP
    const totalFiles = filesToProcess.length;
    let processedFiles = 0;
    
    // 使用更高效的方式处理文件
    // const chunkSize = 1024 * 1024 * 2; // 2MB 分块处理大文件
    
    const promises = filesToProcess.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                zip.file(file.name, e.target.result);
                processedFiles++;
                processedSize += file.size;
                
                // 更新读取文件的进度，基于已处理的数据量而非文件数量
                const percent = (processedSize / totalSize) * readingPhasePercent;
                updateProgressBar(percent, 
                    `正在处理文件 (${processedFiles}/${totalFiles}) - ${Math.round(processedSize / 1024 / 1024)}MB/${Math.round(totalSize / 1024 / 1024)}MB`);
                
                resolve();
            };
            
            // 对于大文件，使用分块读取可能更高效，但FileReader.readAsArrayBuffer不支持分块
            // 这里仍然使用完整读取，但未来可以考虑使用Blob.slice进行分块处理
            reader.readAsArrayBuffer(file);
        });
    });
    
    // 等待所有文件添加完成
    await Promise.all(promises);
    
    // 更新进度条状态
    updateProgressBar(readingPhasePercent, '正在生成ZIP文件...');
    
    // 根据文件类型选择不同的压缩级别
    // RAW文件已经是压缩格式，使用较低的压缩级别以提高速度
    const compressionLevel = type === 'raw' ? 1 : 6;
    
    // 生成ZIP并下载，使用回调来跟踪进度
    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
        comment: '由相机照片分类工具生成',
        // 添加进度回调
        onUpdate: function(metadata) {
            // 更精确地映射压缩阶段的进度
            const percent = readingPhasePercent + (metadata.percent * zipPhasePercent / 100);
            updateProgressBar(percent, `正在生成ZIP文件... ${Math.round(metadata.percent)}%`);
        }
    });

    let datePrefix = new Date().toISOString().slice(0, 10);
    let baseName = '';

    if (allFiles.length > 0) {
        const firstFile = allFiles[0];
        datePrefix = getDateFromFilename(firstFile.name);
        baseName = getBaseFilename(firstFile.name);
    }
    
    // 组合文件名
    let zipFilename = `相机照片_${datePrefix}_${baseName ? baseName + '_' : ''}${type.toUpperCase()}`;
    if (chunkIndex) {
        zipFilename += `_part${chunkIndex}`;
    }
    zipFilename += `.zip`;

    saveAs(zipBlob, zipFilename);
    
    // 隐藏进度条
    hideProgressBar();
}
// 清空所有文件和预览
function clearAll() {
    allFiles = [];
    selectedFiles.clear();
    updateFileStats();
    renderPreview();
    updateButtonStates();
    clearCache(); // 清空缓存
}

// 显示进度条
function showProgressBar(message = '准备下载...') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    if (message) {
        progressText.textContent = message;
    }
}

// 更新进度条
function updateProgressBar(percent, message) {
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${Math.round(percent)}%`;
    if (message) {
        progressText.textContent = message;
    }
}

// 隐藏进度条
function hideProgressBar() {
    setTimeout(() => {
        progressContainer.style.display = 'none';
    }, 1000); // 延迟1秒隐藏，让用户看到100%的状态
}

// 更新预览模式
function updatePreviewMode() {
    previewSettings.mode = viewModeSelect.value;
    renderPreview();
}

// 更新预览大小
function updatePreviewSize() {
    previewSettings.size = parseInt(previewSizeSlider.value);
    previewSizeValue.textContent = `${previewSettings.size}px`;
    renderPreview();
}

// 缩放图片
function zoomImage(factor) {
    if (modalImg.src) {
        previewSettings.zoomLevel = Math.max(0.1, previewSettings.zoomLevel * factor);
        modalImg.style.transform = `scale(${previewSettings.zoomLevel})`;
    }
}

// 重置缩放
function resetZoom() {
    previewSettings.zoomLevel = 1;
    modalImg.style.transform = `scale(${previewSettings.zoomLevel})`;
}

// 初始化应用
function init() {
    initEventListeners();
    
    // 初始化预览设置
    updatePreviewMode();
    updatePreviewSize();
    loadCachedFiles(); // 加载缓存的文件状态
}

// 当页面加载完成后初始化应用
window.addEventListener('DOMContentLoaded', init);

// 对文件进行分组，将JPG和对应的RAW文件归类
function groupFiles(files) {
    const groups = new Map();

    files.forEach(file => {
        const baseName = getBaseFilename(file.name);
        if (!groups.has(baseName)) {
            groups.set(baseName, []);
        }
        groups.get(baseName).push(file);
    });

    // 确保每个组中JPG文件在前，RAW文件在后
    return Array.from(groups.values()).map(group => {
        group.sort((a, b) => {
            const extA = getFileExtension(a.name).toLowerCase();
            const extB = getFileExtension(b.name).toLowerCase();
            if (isJpgFile(extA) && !isJpgFile(extB)) return -1;
            if (!isJpgFile(extA) && isJpgFile(extB)) return 1;
            return 0;
        });
        return group;
    });
}

// 关闭模态框时清理裁剪器
closeModal.addEventListener('click', () => {
    modal.style.display = "none";
    if (cropper) {
        cropper.destroy();
        cropper = null;
        document.getElementById('cropBtn').textContent = '裁剪';
        // 重新启用按钮
        document.getElementById('zoomInBtn').disabled = false;
        document.getElementById('zoomOutBtn').disabled = false;
        document.getElementById('resetZoomBtn').disabled = false;
    }
});

// 切换裁剪模式
function toggleCrop() {
    const cropBtn = document.getElementById('cropBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn'); 
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    
    if (cropper) {
        // 如果裁剪器已经存在，则应用裁剪并销毁实例
        const canvas = cropper.getCroppedCanvas();
        if (canvas) {
            canvas.toBlob(async (blob) => {
                const croppedFile = new File([blob], modalCaption.textContent, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                
                // 释放之前的URL对象
                URL.revokeObjectURL(modalImg.src);
                
                // 更新预览图
                modalImg.src = URL.createObjectURL(croppedFile);
                
                // 更新文件列表中的文件
                const fileIndex = allFiles.findIndex(f => f.name === modalCaption.textContent);
                if (fileIndex !== -1) {
                    allFiles[fileIndex] = croppedFile;
                    await renderPreview();
                }
            }, 'image/jpeg', 0.95); // 设置较高的图片质量
        }
        
        // 清理裁剪器
        cropper.destroy();
        cropper = null;
        cropBtn.textContent = '裁剪';
        
        // 重新启用缩放按钮
        [zoomInBtn, zoomOutBtn, resetZoomBtn].forEach(btn => btn.disabled = false);
        
    } else {
        // 创建新的裁剪器实例
        cropper = new Cropper(modalImg, {
            aspectRatio: NaN,
            viewMode: 2,
            background: true,
            modal: true,
            zoomable: false,
            cropBoxResizable: true,
            cropBoxMovable: true,
            dragMode: 'move',
            autoCropArea: 0.8, // 初始裁剪框大小
            responsive: true,
            restore: true,
            center: true,
            highlight: false,
            guides: true,
            movable: true
        });
        
        cropBtn.textContent = '完成';
        
        // 禁用缩放按钮
        [zoomInBtn, zoomOutBtn, resetZoomBtn].forEach(btn => btn.disabled = true);
    }
}
