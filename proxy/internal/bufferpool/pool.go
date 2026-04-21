package bufferpool

import "sync"

type Pool struct {
	size int
	pool sync.Pool
}

func New(size int) *Pool {
	return &Pool{
		size: size,
		pool: sync.Pool{
			New: func() any {
				return make([]byte, size)
			},
		},
	}
}

func (p *Pool) Get() []byte {
	return p.pool.Get().([]byte)
}

func (p *Pool) Put(buf []byte) {
	if cap(buf) < p.size {
		return
	}

	p.pool.Put(buf[:p.size])
}
