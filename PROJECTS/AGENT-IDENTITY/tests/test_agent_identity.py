import pytest

def test_agent_identity_generate():
    from agent_identity_poc import AgentIdentity
    identity = AgentIdentity()
    agent_id = identity.generate('TestAgent')
    assert agent_id.startswith('agent_')
    assert len(agent_id) == 22

def test_agent_identity_sign_verify():
    from agent_identity_poc import AgentIdentity
    identity = AgentIdentity()
    identity.generate('TestAgent')
    message = 'Test message'
    signature = identity.sign(message)
    assert identity.verify(message, signature)
    assert not identity.verify('Wrong message', signature)

def test_agent_registry():
    from agent_identity_poc import AgentIdentity, AgentRegistry
    identity = AgentIdentity()
    info = identity.generate('TestAgent')
    registry = AgentRegistry()
    registry.register(info['name'], info['agentId'], info['publicKey'])
    assert registry.getAgent(info['agentId']) is not None
